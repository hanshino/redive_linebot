# NestJS 實作指南

## 概述

本文檔提供權限系統與群組設定系統在 NestJS 中的具體實作指引，包含模組結構、Service 層、Middleware 層的設計。

**適用範圍**：
- NestJS 開發者
- 實作權限檢查邏輯
- 實作群組設定管理
- LINE Bot 事件處理

**最後更新**：2025-01-25

---

## 專案結構

```
apps/backend/src/
├── line/                           # LINE Bot 核心（已存在）
│   ├── guards/
│   │   └── signature.guard.ts
│   ├── middleware/
│   │   ├── rate-limit.middleware.ts
│   │   ├── logging.middleware.ts
│   │   ├── permission.middleware.ts    # 🆕 權限中介層
│   │   └── echo.middleware.ts
│   ├── services/
│   │   ├── line.service.ts
│   │   ├── idempotency.service.ts
│   │   └── middleware-runner.service.ts
│   ├── types/
│   │   └── middleware.types.ts         # 🆕 擴展 MiddlewareContext
│   ├── line.controller.ts
│   ├── line.service.ts
│   └── line.module.ts
├── permission/                         # 🆕 權限模組
│   ├── permission.module.ts
│   ├── permission.service.ts
│   ├── dto/
│   │   ├── set-permission.dto.ts
│   │   └── remove-permission.dto.ts
│   └── types/
│       └── permission.types.ts
├── group-config/                       # 🆕 群組設定模組
│   ├── group-config.module.ts
│   ├── group-config.service.ts
│   ├── dto/
│   │   ├── update-config.dto.ts
│   │   └── feature-toggle.dto.ts
│   └── types/
│       └── config.types.ts
├── prisma/                             # Prisma 模組（已存在）
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── redis/                              # Redis 模組（已存在）
│   ├── redis.module.ts
│   └── redis.service.ts
└── app.module.ts
```

---

## 步驟 1：擴展 MiddlewareContext

### 1.1 定義權限資訊型別

**檔案**：`src/line/types/middleware.types.ts`

```typescript
import type { WebhookEvent } from "@line/bot-sdk";
import type { LineService } from "../services/line.service";
import type { RedisService } from "../../redis/redis.service";

export enum Role {
  USER = "USER",
  GROUP_ADMIN = "GROUP_ADMIN",
  GROUP_OWNER = "GROUP_OWNER",
  BOT_ADMIN = "BOT_ADMIN",
  SUPER_ADMIN = "SUPER_ADMIN",
}

export interface PermissionInfo {
  userId: string;
  groupId?: string;  // 私聊時為 undefined
  role: Role;
}

export interface MiddlewareContext {
  event: WebhookEvent;
  services: {
    line: LineService;
    redis: RedisService;
  };
  permission?: PermissionInfo;  // 🆕 權限資訊
}

export type NextFunction = () => Promise<void>;

export interface LineMiddleware {
  handle(ctx: MiddlewareContext, next: NextFunction): Promise<void>;
}
```

---

## 步驟 2：建立 Permission Module

### 2.1 Prisma Schema

**檔案**：`apps/backend/prisma/schema.prisma`

```prisma
// 在現有 schema 中新增

model UserPermission {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  groupId   String?  @map("group_id")
  role      Role
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([userId, groupId])
  @@index([userId])
  @@index([groupId])
  @@map("user_permissions")
}

enum Role {
  USER
  GROUP_ADMIN
  GROUP_OWNER
  BOT_ADMIN
  SUPER_ADMIN
}

model GroupConfig {
  groupId   String   @id @map("group_id")
  config    Json
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("group_configs")
}
```

**執行 Migration**：
```bash
pnpm db:generate
pnpm db:push
```

### 2.2 Permission Service

**檔案**：`src/permission/permission.service.ts`

```typescript
import { Injectable, ForbiddenException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Role } from "@prisma/client";
import type { MiddlewareContext } from "../line/types/middleware.types";

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取得用戶在特定群組的角色
   * 
   * 查詢順序：
   * 1. 全域權限（groupId = null）優先
   * 2. 群組權限
   * 3. 預設為 USER
   */
  async getUserRole(userId: string, groupId?: string): Promise<Role> {
    // 1. 檢查全域權限
    const globalPermission = await this.prisma.userPermission.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId: null,
        },
      },
    });

    if (globalPermission) {
      this.logger.debug(
        `User ${userId} has global permission: ${globalPermission.role}`
      );
      return globalPermission.role;
    }

    // 2. 如果沒有 groupId（私聊），預設為 USER
    if (!groupId) {
      return Role.USER;
    }

    // 3. 檢查群組權限
    const groupPermission = await this.prisma.userPermission.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });

    if (groupPermission) {
      this.logger.debug(
        `User ${userId} has permission in group ${groupId}: ${groupPermission.role}`
      );
      return groupPermission.role;
    }

    // 4. 預設為 USER
    return Role.USER;
  }

  /**
   * 檢查是否有足夠權限（拋錯版）
   */
  require(ctx: MiddlewareContext, minRole: Role): void {
    if (!ctx.permission) {
      throw new Error(
        "Permission not initialized. Did you add PermissionMiddleware?"
      );
    }

    if (!this.hasRole(ctx, minRole)) {
      throw new ForbiddenException(`需要 ${minRole} 以上權限`);
    }
  }

  /**
   * 檢查是否有足夠權限（回傳 boolean）
   */
  hasRole(ctx: MiddlewareContext, minRole: Role): boolean {
    if (!ctx.permission) {
      throw new Error(
        "Permission not initialized. Did you add PermissionMiddleware?"
      );
    }

    return this.compareRole(ctx.permission.role, minRole) >= 0;
  }

  /**
   * 比較角色大小
   */
  private compareRole(userRole: Role, requiredRole: Role): number {
    const hierarchy: Record<Role, number> = {
      [Role.USER]: 1,
      [Role.GROUP_ADMIN]: 2,
      [Role.GROUP_OWNER]: 3,
      [Role.BOT_ADMIN]: 4,
      [Role.SUPER_ADMIN]: 5,
    };

    return hierarchy[userRole] - hierarchy[requiredRole];
  }

  /**
   * 設定用戶權限
   */
  async setPermission(
    userId: string,
    groupId: string | null,
    role: Role
  ): Promise<void> {
    await this.prisma.userPermission.upsert({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
      update: { role },
      create: {
        userId,
        groupId,
        role,
      },
    });

    this.logger.log(
      `Permission set: ${userId} -> ${role} in ${groupId || "global"}`
    );
  }

  /**
   * 移除用戶權限
   */
  async removePermission(
    userId: string,
    groupId: string | null
  ): Promise<void> {
    await this.prisma.userPermission.delete({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });

    this.logger.log(
      `Permission removed: ${userId} from ${groupId || "global"}`
    );
  }

  /**
   * 取得群組的所有管理員
   */
  async getGroupAdmins(groupId: string): Promise<string[]> {
    const permissions = await this.prisma.userPermission.findMany({
      where: {
        groupId,
        role: {
          in: [Role.GROUP_ADMIN, Role.GROUP_OWNER],
        },
      },
      select: {
        userId: true,
      },
    });

    return permissions.map((p) => p.userId);
  }
}
```

### 2.3 Permission Module

**檔案**：`src/permission/permission.module.ts`

```typescript
import { Module, Global } from "@nestjs/common";
import { PermissionService } from "./permission.service";
import { PrismaModule } from "../prisma/prisma.module";

@Global()  // 全域模組，讓其他模組可以直接注入
@Module({
  imports: [PrismaModule],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionModule {}
```

---

## 步驟 3：建立 Permission Middleware

**檔案**：`src/line/middleware/permission.middleware.ts`

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { PermissionService } from "../../permission/permission.service";
import type {
  LineMiddleware,
  MiddlewareContext,
  NextFunction,
} from "../types/middleware.types";

@Injectable()
export class PermissionMiddleware implements LineMiddleware {
  private readonly logger = new Logger(PermissionMiddleware.name);

  constructor(private readonly permissionService: PermissionService) {}

  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    const userId = this.extractUserId(ctx.event);
    const groupId = this.extractGroupId(ctx.event);

    if (!userId) {
      this.logger.warn("Cannot extract userId from event");
      return next();
    }

    // 查詢權限
    const role = await this.permissionService.getUserRole(userId, groupId);

    // 注入到 context
    ctx.permission = {
      userId,
      groupId,
      role,
    };

    this.logger.debug(
      `Permission injected: ${userId} -> ${role} in ${groupId || "private"}`
    );

    await next();
  }

  /**
   * 從事件中提取 userId
   */
  private extractUserId(event: any): string | undefined {
    return event.source?.userId;
  }

  /**
   * 從事件中提取 groupId
   */
  private extractGroupId(event: any): string | undefined {
    return event.source?.groupId;
  }
}
```

**註冊 Middleware**：

**檔案**：`src/line/line.module.ts`

```typescript
import { PermissionMiddleware } from "./middleware/permission.middleware";

const LINE_MIDDLEWARES = [
  RateLimitMiddleware,
  LoggingMiddleware,
  PermissionMiddleware,  // 🆕 加在這裡
  EchoMiddleware,
];
```

---

## 步驟 4：建立 Group Config Module

### 4.1 Group Config Types

**檔案**：`src/group-config/types/config.types.ts`

```typescript
export interface GroupConfigData {
  features: {
    welcomeMessage: boolean;
    gacha: boolean;
    character: boolean;
    announce: boolean;
    customCommands: boolean;
    worldBoss: boolean;
    clanBattle: boolean;
    minigames: boolean;
    chatLevel: boolean;
    market: boolean;
    discordWebhook: boolean;
  };
  welcomeMessage?: string;
  commandPrefix: string;
  groupNickname?: string;
  cooldowns?: {
    gacha?: number;
    query?: number;
    minigame?: number;
    customCmd?: number;
  };
}

export const DEFAULT_CONFIG: GroupConfigData = {
  features: {
    welcomeMessage: true,
    gacha: true,
    character: true,
    announce: true,
    customCommands: true,
    worldBoss: false,
    clanBattle: false,
    minigames: false,
    chatLevel: false,
    market: false,
    discordWebhook: false,
  },
  commandPrefix: "#",
  cooldowns: {},
};

export const MIN_COOLDOWNS = {
  gacha: 30,
  query: 10,
  minigame: 30,
  customCmd: 5,
} as const;
```

### 4.2 Group Config Service

**檔案**：`src/group-config/group-config.service.ts`

```typescript
import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { GroupConfigData } from "./types/config.types";
import { DEFAULT_CONFIG, MIN_COOLDOWNS } from "./types/config.types";

@Injectable()
export class GroupConfigService {
  private readonly logger = new Logger(GroupConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取得群組設定
   */
  async getConfig(groupId: string): Promise<GroupConfigData> {
    const record = await this.prisma.groupConfig.findUnique({
      where: { groupId },
    });

    if (!record) {
      // 如果沒有記錄，返回預設設定
      return DEFAULT_CONFIG;
    }

    return record.config as GroupConfigData;
  }

  /**
   * 初始化群組設定
   */
  async initializeGroup(groupId: string): Promise<void> {
    await this.prisma.groupConfig.upsert({
      where: { groupId },
      update: {},  // 已存在則不更新
      create: {
        groupId,
        config: DEFAULT_CONFIG,
      },
    });

    this.logger.log(`Group ${groupId} initialized`);
  }

  /**
   * 切換功能開關
   */
  async toggleFeature(
    groupId: string,
    featureName: keyof GroupConfigData["features"],
    enabled: boolean
  ): Promise<void> {
    const config = await this.getConfig(groupId);

    config.features[featureName] = enabled;

    await this.prisma.groupConfig.upsert({
      where: { groupId },
      update: { config },
      create: { groupId, config },
    });

    this.logger.log(
      `Feature ${featureName} ${enabled ? "enabled" : "disabled"} for ${groupId}`
    );
  }

  /**
   * 設定歡迎訊息
   */
  async setWelcomeMessage(
    groupId: string,
    message: string
  ): Promise<void> {
    if (message.length > 500) {
      throw new BadRequestException("歡迎訊息不可超過 500 字元");
    }

    const config = await this.getConfig(groupId);
    config.welcomeMessage = message;

    await this.prisma.groupConfig.upsert({
      where: { groupId },
      update: { config },
      create: { groupId, config },
    });

    this.logger.log(`Welcome message updated for ${groupId}`);
  }

  /**
   * 設定指令前綴
   */
  async setCommandPrefix(
    groupId: string,
    prefix: string
  ): Promise<void> {
    if (prefix.length !== 1) {
      throw new BadRequestException("指令前綴必須是單一字元");
    }

    const config = await this.getConfig(groupId);
    config.commandPrefix = prefix;

    await this.prisma.groupConfig.upsert({
      where: { groupId },
      update: { config },
      create: { groupId, config },
    });

    this.logger.log(`Command prefix updated to "${prefix}" for ${groupId}`);
  }

  /**
   * 設定冷卻時間
   */
  async setCooldown(
    groupId: string,
    feature: keyof typeof MIN_COOLDOWNS,
    seconds: number
  ): Promise<void> {
    const minCooldown = MIN_COOLDOWNS[feature];

    if (seconds < minCooldown) {
      throw new BadRequestException(
        `冷卻時間不可低於 ${minCooldown} 秒`
      );
    }

    const config = await this.getConfig(groupId);
    
    if (!config.cooldowns) {
      config.cooldowns = {};
    }
    
    config.cooldowns[feature] = seconds;

    await this.prisma.groupConfig.upsert({
      where: { groupId },
      update: { config },
      create: { groupId, config },
    });

    this.logger.log(
      `Cooldown for ${feature} set to ${seconds}s for ${groupId}`
    );
  }

  /**
   * 檢查功能是否開啟
   */
  async isFeatureEnabled(
    groupId: string,
    featureName: keyof GroupConfigData["features"]
  ): Promise<boolean> {
    const config = await this.getConfig(groupId);
    return config.features[featureName];
  }
}
```

### 4.3 Group Config Module

**檔案**：`src/group-config/group-config.module.ts`

```typescript
import { Module, Global } from "@nestjs/common";
import { GroupConfigService } from "./group-config.service";
import { PrismaModule } from "../prisma/prisma.module";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [GroupConfigService],
  exports: [GroupConfigService],
})
export class GroupConfigModule {}
```

---

## 步驟 5：在 App Module 註冊

**檔案**：`src/app.module.ts`

```typescript
import { PermissionModule } from "./permission/permission.module";
import { GroupConfigModule } from "./group-config/group-config.module";

@Module({
  imports: [
    ConfigModule,
    HealthModule,
    PrismaModule,
    RedisModule,
    PermissionModule,     // 🆕
    GroupConfigModule,    // 🆕
    LineModule,
  ],
})
export class AppModule {}
```

---

## 步驟 6：在業務邏輯中使用

### 6.1 範例：設定歡迎訊息指令

**檔案**：`src/line/middleware/group-config.middleware.ts`（新增）

```typescript
import { Injectable } from "@nestjs/common";
import { PermissionService } from "../../permission/permission.service";
import { GroupConfigService } from "../../group-config/group-config.service";
import { Role } from "@prisma/client";
import type {
  LineMiddleware,
  MiddlewareContext,
  NextFunction,
} from "../types/middleware.types";

@Injectable()
export class GroupConfigMiddleware implements LineMiddleware {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly groupConfigService: GroupConfigService
  ) {}

  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    if (ctx.event.type !== "message" || ctx.event.message.type !== "text") {
      return next();
    }

    const text = ctx.event.message.text;
    const config = await this.groupConfigService.getConfig(
      ctx.permission?.groupId || ""
    );
    const prefix = config.commandPrefix;

    // 設定歡迎訊息
    if (text.startsWith(`${prefix}設定歡迎訊息 `)) {
      // 檢查權限
      if (!this.permissionService.hasRole(ctx, Role.GROUP_ADMIN)) {
        return ctx.services.line.replyMessage(ctx.event.replyToken, [
          {
            type: "text",
            text: "❌ 你沒有權限執行此操作（需要群組管理員）",
          },
        ]);
      }

      const message = text.replace(`${prefix}設定歡迎訊息 `, "");

      try {
        await this.groupConfigService.setWelcomeMessage(
          ctx.permission!.groupId!,
          message
        );

        return ctx.services.line.replyMessage(ctx.event.replyToken, [
          { type: "text", text: "✅ 歡迎訊息已設定" },
        ]);
      } catch (error) {
        return ctx.services.line.replyMessage(ctx.event.replyToken, [
          {
            type: "text",
            text: `❌ 設定失敗：${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ]);
      }
    }

    // 切換功能
    if (text.startsWith(`${prefix}功能 `)) {
      if (!this.permissionService.hasRole(ctx, Role.GROUP_ADMIN)) {
        return ctx.services.line.replyMessage(ctx.event.replyToken, [
          { type: "text", text: "❌ 你沒有權限執行此操作" },
        ]);
      }

      const match = text.match(/功能 (開啟|關閉) (.+)/);
      if (!match) {
        return ctx.services.line.replyMessage(ctx.event.replyToken, [
          {
            type: "text",
            text: "❌ 格式錯誤，請使用：#功能 開啟/關閉 <功能名稱>",
          },
        ]);
      }

      const [, action, featureName] = match;
      const enabled = action === "開啟";

      // TODO: 對應功能名稱到 config key

      return ctx.services.line.replyMessage(ctx.event.replyToken, [
        {
          type: "text",
          text: `✅ 功能 ${featureName} 已${action}`,
        },
      ]);
    }

    await next();
  }
}
```

**註冊到 LINE Module**：
```typescript
const LINE_MIDDLEWARES = [
  RateLimitMiddleware,
  LoggingMiddleware,
  PermissionMiddleware,
  GroupConfigMiddleware,  // 🆕
  EchoMiddleware,
];
```

---

## 測試

### 單元測試範例

**檔案**：`src/permission/permission.service.spec.ts`

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { PermissionService } from "./permission.service";
import { PrismaService } from "../prisma/prisma.service";
import { Role } from "@prisma/client";

describe("PermissionService", () => {
  let service: PermissionService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        {
          provide: PrismaService,
          useValue: {
            userPermission: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("getUserRole", () => {
    it("should return global permission if exists", async () => {
      jest.spyOn(prisma.userPermission, "findUnique").mockResolvedValueOnce({
        id: "1",
        userId: "U123",
        groupId: null,
        role: Role.BOT_ADMIN,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const role = await service.getUserRole("U123", "C456");

      expect(role).toBe(Role.BOT_ADMIN);
    });

    it("should return group permission if no global permission", async () => {
      jest
        .spyOn(prisma.userPermission, "findUnique")
        .mockResolvedValueOnce(null)  // 第一次查詢（全域）
        .mockResolvedValueOnce({       // 第二次查詢（群組）
          id: "2",
          userId: "U123",
          groupId: "C456",
          role: Role.GROUP_ADMIN,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      const role = await service.getUserRole("U123", "C456");

      expect(role).toBe(Role.GROUP_ADMIN);
    });

    it("should return USER if no permission found", async () => {
      jest.spyOn(prisma.userPermission, "findUnique").mockResolvedValue(null);

      const role = await service.getUserRole("U123", "C456");

      expect(role).toBe(Role.USER);
    });
  });
});
```

---

## 部署檢查清單

- [ ] Prisma Migration 已執行（`pnpm db:push`）
- [ ] 環境變數已設定（`DATABASE_URL`, `REDIS_URL`）
- [ ] 初始 Super Admin 已建立
- [ ] TypeScript 編譯通過（`pnpm typecheck`）
- [ ] 單元測試通過（`pnpm test`）
- [ ] Docker 服務正常運作（PostgreSQL, Redis）

---

## 相關文檔

- [權限系統設計](./01-permission-system.md)
- [群組設定系統設計](./02-group-config-system.md)
- [資料模型設計](./03-data-models.md)

---

## 變更歷史

| 日期 | 版本 | 變更內容 | 作者 |
|------|------|---------|------|
| 2025-01-25 | 1.0 | 初始版本 | Sisyphus |
