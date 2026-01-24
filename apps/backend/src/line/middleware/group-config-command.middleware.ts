import { Injectable, Logger } from "@nestjs/common";
import { Role } from "@prisma/client";
import { GroupConfigService } from "../../group-config/group-config.service";
import { PermissionService } from "../../permission/permission.service";
import type {
  LineMiddleware,
  MiddlewareContext,
  NextFunction,
} from "./middleware.types";

@Injectable()
export class GroupConfigCommandMiddleware implements LineMiddleware {
  private readonly logger = new Logger(GroupConfigCommandMiddleware.name);

  constructor(
    private readonly permissionService: PermissionService,
    private readonly groupConfigService: GroupConfigService
  ) {}

  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    if (ctx.event.type !== "message" || ctx.event.message.type !== "text") {
      return next();
    }

    const text = ctx.event.message.text;
    const groupId = ctx.permission?.groupId;

    if (!groupId) {
      return next();
    }

    const config = await this.groupConfigService.getConfig(groupId);
    const prefix = config.commandPrefix;

    if (text.startsWith(`${prefix}初始化`)) {
      await this.handleInitialize(ctx, groupId);
      return;
    }

    if (text.startsWith(`${prefix}設定歡迎訊息 `)) {
      await this.handleSetWelcomeMessage(ctx, groupId, text, prefix);
      return;
    }

    if (text.startsWith(`${prefix}設定指令前綴 `)) {
      await this.handleSetCommandPrefix(ctx, groupId, text, prefix);
      return;
    }

    if (text.startsWith(`${prefix}功能 `)) {
      await this.handleToggleFeature(ctx, groupId, text, prefix);
      return;
    }

    if (text === `${prefix}查看設定`) {
      await this.handleShowConfig(ctx, groupId, config);
      return;
    }

    await next();
  }

  private async handleInitialize(
    ctx: MiddlewareContext,
    groupId: string
  ): Promise<void> {
    const userId = ctx.permission!.userId;

    const existingOwner = await this.permissionService.getGroupAdmins(groupId);

    if (existingOwner.length > 0) {
      await this.replyText(ctx, "❌ 此群組已完成初始化");
      return;
    }

    await this.permissionService.setPermission(
      userId,
      groupId,
      Role.GROUP_OWNER
    );
    await this.groupConfigService.initializeGroup(groupId);

    await this.replyText(ctx, "✅ 群組初始化完成！\n你已成為群組擁有者");

    this.logger.log(`Group ${groupId} initialized by ${userId}`);
  }

  private async handleSetWelcomeMessage(
    ctx: MiddlewareContext,
    groupId: string,
    text: string,
    prefix: string
  ): Promise<void> {
    if (!this.permissionService.hasRole(ctx, Role.GROUP_ADMIN)) {
      await this.replyText(ctx, "❌ 你沒有權限執行此操作（需要群組管理員）");
      return;
    }

    const message = text.replace(`${prefix}設定歡迎訊息 `, "");

    try {
      await this.groupConfigService.setWelcomeMessage(groupId, message);
      await this.replyText(ctx, "✅ 歡迎訊息已設定");
      this.logger.log(`Welcome message updated for ${groupId}`);
    } catch (error) {
      await this.replyText(
        ctx,
        `❌ 設定失敗：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleSetCommandPrefix(
    ctx: MiddlewareContext,
    groupId: string,
    text: string,
    prefix: string
  ): Promise<void> {
    if (!this.permissionService.hasRole(ctx, Role.GROUP_OWNER)) {
      await this.replyText(ctx, "❌ 你沒有權限執行此操作（需要群組擁有者）");
      return;
    }

    const newPrefix = text.replace(`${prefix}設定指令前綴 `, "");

    try {
      await this.groupConfigService.setCommandPrefix(groupId, newPrefix);
      await this.replyText(ctx, `✅ 指令前綴已更改為：${newPrefix}`);
      this.logger.log(
        `Command prefix updated to "${newPrefix}" for ${groupId}`
      );
    } catch (error) {
      await this.replyText(
        ctx,
        `❌ 設定失敗：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleToggleFeature(
    ctx: MiddlewareContext,
    groupId: string,
    text: string,
    prefix: string
  ): Promise<void> {
    if (!this.permissionService.hasRole(ctx, Role.GROUP_ADMIN)) {
      await this.replyText(ctx, "❌ 你沒有權限執行此操作（需要群組管理員）");
      return;
    }

    const match = text.match(new RegExp(`${prefix}功能 (開啟|關閉) (.+)`));

    if (!match) {
      await this.replyText(
        ctx,
        `❌ 格式錯誤，請使用：${prefix}功能 開啟/關閉 <功能名稱>`
      );
      return;
    }

    const [, action, featureName] = match;
    const enabled = action === "開啟";

    const featureMap: Record<
      string,
      keyof typeof import("../../group-config/types/config.types").DEFAULT_CONFIG.features
    > = {
      歡迎訊息: "welcomeMessage",
      抽卡: "gacha",
      角色查詢: "character",
      公告: "announce",
      自訂指令: "customCommands",
      世界王: "worldBoss",
      會戰: "clanBattle",
      小遊戲: "minigames",
      聊天等級: "chatLevel",
      市場: "market",
      Discord通知: "discordWebhook",
    };

    const featureKey = featureMap[featureName];

    if (!featureKey) {
      await this.replyText(
        ctx,
        `❌ 未知的功能名稱：${featureName}\n可用功能：${Object.keys(featureMap).join("、")}`
      );
      return;
    }

    try {
      await this.groupConfigService.toggleFeature(groupId, featureKey, enabled);
      await this.replyText(ctx, `✅ 功能「${featureName}」已${action}`);
      this.logger.log(
        `Feature ${featureKey} ${enabled ? "enabled" : "disabled"} for ${groupId}`
      );
    } catch (error) {
      await this.replyText(
        ctx,
        `❌ 操作失敗：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleShowConfig(
    ctx: MiddlewareContext,
    _groupId: string,
    config: any
  ): Promise<void> {
    const features = Object.entries(config.features)
      .map(([key, value]) => `${value ? "✅" : "❌"} ${key}`)
      .join("\n");

    const message = [
      "📋 群組設定",
      "",
      "指令前綴：" + config.commandPrefix,
      config.groupNickname ? "群組暱稱：" + config.groupNickname : "",
      "",
      "功能狀態：",
      features,
    ]
      .filter(Boolean)
      .join("\n");

    await this.replyText(ctx, message);
  }

  private async replyText(ctx: MiddlewareContext, text: string): Promise<void> {
    if (!ctx.replyToken) {
      this.logger.warn("No reply token available");
      return;
    }

    this.logger.debug(`Replying: ${text.substring(0, 50)}...`);
  }
}
