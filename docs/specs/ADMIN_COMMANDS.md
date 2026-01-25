# Admin Commands Specification

Admin commands for managing user resources and economy in the Gacha & Inventory System.

## Overview

Admin commands follow the existing command pattern using `@Command` decorator and require `BOT_ADMIN` or `SUPER_ADMIN` role.

## Commands

### 1. Give Jewel to Specific User

**Syntax**: `#admin give @user jewel <amount>`

**Description**: Distribute jewel (gacha currency) to a specific user

**Permission Required**: `BOT_ADMIN` or `SUPER_ADMIN`

**Parameters**:

- `@user` (mention): LINE user mention (e.g., `@display_name`)
- `amount` (number): Positive integer amount of jewel to give

**Examples**:

```
#admin give @John jewel 1500
#admin give @測試使用者 jewel 3000
```

**Success Response**:

```
✅ 成功發放 1500 寶石給 @John
(新餘額: 1500)
```

**Error Cases**:

| Error              | Response                                                        |
| ------------------ | --------------------------------------------------------------- |
| Invalid amount     | ❌ 金額必須是正整數                                             |
| User not found     | ❌ 找不到使用者 @John                                           |
| Permission denied  | ❌ 權限不足 (需要 BOT_ADMIN 或以上權限)                         |
| Missing parameters | ❌ 指令格式錯誤<br>正確格式: `#admin give @user jewel <amount>` |

---

### 2. Give Jewel to All Users

**Syntax**: `#admin give @all jewel <amount>`

**Description**: Distribute jewel (gacha currency) to all users in the group or channel

**Permission Required**: `BOT_ADMIN` or `SUPER_ADMIN`

**Parameters**:

- `@all` (literal): Keyword to target all users
- `amount` (number): Positive integer amount of jewel to give

**Examples**:

```
#admin give @all jewel 150
#admin give @all jewel 1500
```

**Success Response**:

```
✅ 成功發放 150 寶石給所有使用者
(共 42 位使用者收到獎勵)
```

**Error Cases**:

| Error              | Response                                                       |
| ------------------ | -------------------------------------------------------------- |
| Invalid amount     | ❌ 金額必須是正整數                                            |
| Permission denied  | ❌ 權限不足 (需要 BOT_ADMIN 或以上權限)                        |
| Missing parameters | ❌ 指令格式錯誤<br>正確格式: `#admin give @all jewel <amount>` |

**Notes**:

- In group context: Distributes to all group members with existing user records
- In 1-on-1 context: Should return error "此指令僅限群組使用"

---

## Implementation Guidance

### 1. Command Registration

Use existing `@Command` decorator pattern from `CommandDiscoveryService`:

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { Command } from "../decorators/command.decorator";
import type { CommandContext } from "../types/command.types";
import { PrismaService } from "../../prisma/prisma.service";
import { Role } from "@prisma/client";

@Injectable()
export class AdminCommands {
  private readonly logger = new Logger(AdminCommands.name);

  constructor(private readonly prisma: PrismaService) {}

  @Command("admin")
  async handleAdminCommand(ctx: CommandContext): Promise<void> {
    // Permission check
    const hasPermission = await this.checkAdminPermission(ctx.userId);
    if (!hasPermission) {
      await ctx.reply("❌ 權限不足 (需要 BOT_ADMIN 或以上權限)");
      return;
    }

    const args = ctx.args;

    // Route to subcommands
    if (args[0] === "give") {
      await this.handleGiveCommand(ctx);
    } else {
      await ctx.reply("❌ 未知的子指令");
    }
  }

  private async checkAdminPermission(userId: string): Promise<boolean> {
    const permissions = await this.prisma.userPermission.findMany({
      where: { userId },
    });

    return permissions.some(
      (p) => p.role === Role.BOT_ADMIN || p.role === Role.SUPER_ADMIN
    );
  }

  private async handleGiveCommand(ctx: CommandContext): Promise<void> {
    // args: ["give", "@user" | "@all", "jewel", "1500"]
    const args = ctx.args;

    if (args.length < 4) {
      await ctx.reply(
        "❌ 指令格式錯誤\n正確格式: `#admin give @user jewel <amount>`"
      );
      return;
    }

    const target = args[1];
    const resource = args[2];
    const amount = parseInt(args[3], 10);

    if (resource !== "jewel") {
      await ctx.reply("❌ 目前僅支援 jewel 資源");
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply("❌ 金額必須是正整數");
      return;
    }

    if (target === "@all") {
      await this.giveJewelToAll(ctx, amount);
    } else if (target.startsWith("@")) {
      await this.giveJewelToUser(ctx, target, amount);
    } else {
      await ctx.reply("❌ 目標必須是 @user 或 @all");
    }
  }

  private async giveJewelToUser(
    ctx: CommandContext,
    mention: string,
    amount: number
  ): Promise<void> {
    // Extract userId from mention (LINE API provides mentionees in webhook)
    const mentionedUserId = this.extractUserIdFromMention(ctx.event, mention);

    if (!mentionedUserId) {
      await ctx.reply(`❌ 找不到使用者 ${mention}`);
      return;
    }

    // Update or create wallet
    const wallet = await this.prisma.userWallet.upsert({
      where: { userId: mentionedUserId },
      update: {
        jewel: {
          increment: amount,
        },
      },
      create: {
        userId: mentionedUserId,
        jewel: amount,
        stone: 0,
        mana: BigInt(0),
      },
    });

    await ctx.reply(
      `✅ 成功發放 ${amount} 寶石給 ${mention}\n(新餘額: ${wallet.jewel})`
    );

    this.logger.log(
      `Admin ${ctx.userId} gave ${amount} jewel to ${mentionedUserId}`
    );
  }

  private async giveJewelToAll(
    ctx: CommandContext,
    amount: number
  ): Promise<void> {
    // Only allow in group context
    if (ctx.event.source.type !== "group") {
      await ctx.reply("❌ 此指令僅限群組使用");
      return;
    }

    const groupId = ctx.event.source.groupId;

    // Get all group members with permissions (existing users)
    const groupMembers = await this.prisma.userPermission.findMany({
      where: { groupId },
      select: { userId: true },
      distinct: ["userId"],
    });

    let successCount = 0;

    for (const member of groupMembers) {
      try {
        await this.prisma.userWallet.upsert({
          where: { userId: member.userId },
          update: {
            jewel: {
              increment: amount,
            },
          },
          create: {
            userId: member.userId,
            jewel: amount,
            stone: 0,
            mana: BigInt(0),
          },
        });
        successCount++;
      } catch (error) {
        this.logger.error(
          `Failed to give jewel to user ${member.userId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    await ctx.reply(
      `✅ 成功發放 ${amount} 寶石給所有使用者\n(共 ${successCount} 位使用者收到獎勵)`
    );

    this.logger.log(
      `Admin ${ctx.userId} gave ${amount} jewel to all users in group ${groupId} (${successCount} recipients)`
    );
  }

  private extractUserIdFromMention(event: any, mention: string): string | null {
    // LINE webhook provides mentionees in message.mention
    if (event.message?.type === "text" && event.message.mention?.mentionees) {
      const mentionees = event.message.mention.mentionees;

      // Find mentionee by display name or index
      // (Implementation depends on actual LINE API structure)
      const mentionee = mentionees.find(
        (m: any) => `@${m.displayName}` === mention
      );

      return mentionee?.userId ?? null;
    }

    return null;
  }
}
```

### 2. CommandContext Type

If `CommandContext` doesn't exist yet, define it as:

```typescript
export interface CommandContext {
  userId: string;
  event: any; // LINE webhook event
  args: string[]; // Parsed command arguments
  reply: (message: string) => Promise<void>;
}
```

### 3. Module Registration

Register the command service in `LineModule`:

```typescript
import { Module } from "@nestjs/common";
import { AdminCommands } from "./commands/admin.commands";
import { CommandDiscoveryService } from "./services/command-discovery.service";

@Module({
  providers: [
    AdminCommands,
    CommandDiscoveryService,
    // ... other providers
  ],
  exports: [CommandDiscoveryService],
})
export class LineModule {}
```

### 4. Testing Strategy

**Unit Tests** (`admin.commands.spec.ts`):

```typescript
import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { AdminCommands } from "./admin.commands";
import { PrismaService } from "../../prisma/prisma.service";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Role } from "@prisma/client";

describe("AdminCommands", () => {
  let service: AdminCommands;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      userPermission: {
        findMany: vi.fn(),
      },
      userWallet: {
        upsert: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCommands,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AdminCommands>(AdminCommands);
  });

  it("should deny non-admin users", async () => {
    mockPrisma.userPermission.findMany.mockResolvedValue([]);

    const mockCtx = {
      userId: "U_NORMAL_USER",
      args: ["give", "@user", "jewel", "1500"],
      reply: vi.fn(),
      event: {},
    };

    await service.handleAdminCommand(mockCtx);

    expect(mockCtx.reply).toHaveBeenCalledWith(
      "❌ 權限不足 (需要 BOT_ADMIN 或以上權限)"
    );
  });

  it("should allow BOT_ADMIN to give jewel", async () => {
    mockPrisma.userPermission.findMany.mockResolvedValue([
      { userId: "U_ADMIN", role: Role.BOT_ADMIN },
    ]);

    mockPrisma.userWallet.upsert.mockResolvedValue({
      userId: "U_TARGET",
      jewel: 1500,
    });

    const mockCtx = {
      userId: "U_ADMIN",
      args: ["give", "@user", "jewel", "1500"],
      reply: vi.fn(),
      event: {
        message: {
          type: "text",
          mention: {
            mentionees: [{ userId: "U_TARGET", displayName: "user" }],
          },
        },
      },
    };

    await service.handleAdminCommand(mockCtx);

    expect(mockPrisma.userWallet.upsert).toHaveBeenCalled();
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining("✅ 成功發放")
    );
  });

  it("should reject invalid amounts", async () => {
    mockPrisma.userPermission.findMany.mockResolvedValue([
      { userId: "U_ADMIN", role: Role.BOT_ADMIN },
    ]);

    const mockCtx = {
      userId: "U_ADMIN",
      args: ["give", "@user", "jewel", "-100"],
      reply: vi.fn(),
      event: {},
    };

    await service.handleAdminCommand(mockCtx);

    expect(mockCtx.reply).toHaveBeenCalledWith("❌ 金額必須是正整數");
  });
});
```

### 5. Security Considerations

1. **Permission Check**: Always verify `BOT_ADMIN` or `SUPER_ADMIN` role before executing
2. **Input Validation**: Validate amount (positive integer), resource type
3. **Rate Limiting**: Consider adding rate limiting for mass distribution commands
4. **Audit Logging**: Log all admin actions with userId, action type, and timestamp
5. **Transaction Safety**: Use database transactions for `@all` operations to ensure atomicity

### 6. Future Enhancements

- [ ] Add more resource types (stone, mana)
- [ ] Add `#admin take` command for removing resources
- [ ] Add `#admin wallet @user` command to view user wallet
- [ ] Add batch import from CSV/JSON
- [ ] Add scheduled distribution (cron jobs)

---

**Version**: 1.0  
**Last Updated**: 2025-01-25  
**Status**: Ready for Implementation
