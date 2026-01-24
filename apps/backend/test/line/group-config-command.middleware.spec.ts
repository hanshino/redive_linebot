import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GroupConfigCommandMiddleware } from "../../src/line/middleware/group-config-command.middleware";
import { PermissionService } from "../../src/permission/permission.service";
import { GroupConfigService } from "../../src/group-config/group-config.service";
import { Role } from "@prisma/client";
import { DEFAULT_CONFIG } from "../../src/group-config/types/config.types";

describe("GroupConfigCommandMiddleware", () => {
  let middleware: GroupConfigCommandMiddleware;
  let mockPermissionService: any;
  let mockGroupConfigService: any;

  beforeEach(async () => {
    mockPermissionService = {
      hasRole: vi.fn(),
      getGroupAdmins: vi.fn(),
      setPermission: vi.fn(),
    };

    mockGroupConfigService = {
      getConfig: vi.fn(),
      initializeGroup: vi.fn(),
      setWelcomeMessage: vi.fn(),
      setCommandPrefix: vi.fn(),
      toggleFeature: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupConfigCommandMiddleware,
        {
          provide: PermissionService,
          useValue: mockPermissionService,
        },
        {
          provide: GroupConfigService,
          useValue: mockGroupConfigService,
        },
      ],
    }).compile();

    middleware = module.get<GroupConfigCommandMiddleware>(
      GroupConfigCommandMiddleware
    );
  });

  it("should be defined", () => {
    expect(middleware).toBeDefined();
  });

  it("should pass through non-text messages", async () => {
    const ctx: any = {
      event: {
        type: "message",
        message: {
          type: "image",
        },
      },
      permission: {
        userId: "U123",
        groupId: "C456",
        role: Role.USER,
      },
    };

    const next = vi.fn();
    await middleware.handle(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it("should pass through private chat messages", async () => {
    mockGroupConfigService.getConfig.mockResolvedValue(DEFAULT_CONFIG);

    const ctx: any = {
      event: {
        type: "message",
        message: {
          type: "text",
          text: "#test",
        },
      },
      permission: {
        userId: "U123",
        role: Role.USER,
      },
    };

    const next = vi.fn();
    await middleware.handle(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it("should initialize group for first owner", async () => {
    mockGroupConfigService.getConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockPermissionService.getGroupAdmins.mockResolvedValue([]);
    mockPermissionService.setPermission.mockResolvedValue(undefined);
    mockGroupConfigService.initializeGroup.mockResolvedValue(undefined);

    const ctx: any = {
      event: {
        type: "message",
        message: {
          type: "text",
          text: "#初始化",
        },
      },
      permission: {
        userId: "U123",
        groupId: "C456",
        role: Role.USER,
      },
      replyToken: "token123",
    };

    const next = vi.fn();
    await middleware.handle(ctx, next);

    expect(mockPermissionService.setPermission).toHaveBeenCalledWith(
      "U123",
      "C456",
      Role.GROUP_OWNER
    );
    expect(mockGroupConfigService.initializeGroup).toHaveBeenCalledWith("C456");
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject initialization if owner exists", async () => {
    mockGroupConfigService.getConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockPermissionService.getGroupAdmins.mockResolvedValue(["U999"]);

    const ctx: any = {
      event: {
        type: "message",
        message: {
          type: "text",
          text: "#初始化",
        },
      },
      permission: {
        userId: "U123",
        groupId: "C456",
        role: Role.USER,
      },
      replyToken: "token123",
    };

    const next = vi.fn();
    await middleware.handle(ctx, next);

    expect(mockPermissionService.setPermission).not.toHaveBeenCalled();
    expect(mockGroupConfigService.initializeGroup).not.toHaveBeenCalled();
  });

  it("should set welcome message with admin permission", async () => {
    mockGroupConfigService.getConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockPermissionService.hasRole.mockReturnValue(true);
    mockGroupConfigService.setWelcomeMessage.mockResolvedValue(undefined);

    const ctx: any = {
      event: {
        type: "message",
        message: {
          type: "text",
          text: "#設定歡迎訊息 歡迎加入！",
        },
      },
      permission: {
        userId: "U123",
        groupId: "C456",
        role: Role.GROUP_ADMIN,
      },
      replyToken: "token123",
    };

    const next = vi.fn();
    await middleware.handle(ctx, next);

    expect(mockGroupConfigService.setWelcomeMessage).toHaveBeenCalledWith(
      "C456",
      "歡迎加入！"
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject welcome message without permission", async () => {
    mockGroupConfigService.getConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockPermissionService.hasRole.mockReturnValue(false);

    const ctx: any = {
      event: {
        type: "message",
        message: {
          type: "text",
          text: "#設定歡迎訊息 test",
        },
      },
      permission: {
        userId: "U123",
        groupId: "C456",
        role: Role.USER,
      },
      replyToken: "token123",
    };

    const next = vi.fn();
    await middleware.handle(ctx, next);

    expect(mockGroupConfigService.setWelcomeMessage).not.toHaveBeenCalled();
  });

  it("should toggle feature with admin permission", async () => {
    mockGroupConfigService.getConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockPermissionService.hasRole.mockReturnValue(true);
    mockGroupConfigService.toggleFeature.mockResolvedValue(undefined);

    const ctx: any = {
      event: {
        type: "message",
        message: {
          type: "text",
          text: "#功能 開啟 抽卡",
        },
      },
      permission: {
        userId: "U123",
        groupId: "C456",
        role: Role.GROUP_ADMIN,
      },
      replyToken: "token123",
    };

    const next = vi.fn();
    await middleware.handle(ctx, next);

    expect(mockGroupConfigService.toggleFeature).toHaveBeenCalledWith(
      "C456",
      "gacha",
      true
    );
  });

  it("should show config", async () => {
    const testConfig = { ...DEFAULT_CONFIG };
    mockGroupConfigService.getConfig.mockResolvedValue(testConfig);

    const ctx: any = {
      event: {
        type: "message",
        message: {
          type: "text",
          text: "#查看設定",
        },
      },
      permission: {
        userId: "U123",
        groupId: "C456",
        role: Role.USER,
      },
      replyToken: "token123",
    };

    const next = vi.fn();
    await middleware.handle(ctx, next);

    expect(mockGroupConfigService.getConfig).toHaveBeenCalledWith("C456");
    expect(next).not.toHaveBeenCalled();
  });
});
