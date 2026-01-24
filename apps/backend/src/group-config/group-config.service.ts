import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { GroupConfigData } from "./types/config.types";
import { DEFAULT_CONFIG, MIN_COOLDOWNS } from "./types/config.types";

@Injectable()
export class GroupConfigService {
  private readonly logger = new Logger(GroupConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getConfig(groupId: string): Promise<GroupConfigData> {
    const record = await this.prisma.groupConfig.findUnique({
      where: { groupId },
    });

    if (!record) {
      return DEFAULT_CONFIG;
    }

    return record.config as unknown as GroupConfigData;
  }

  async initializeGroup(groupId: string): Promise<void> {
    await this.prisma.groupConfig.upsert({
      where: { groupId },
      update: {},
      create: {
        groupId,
        config: DEFAULT_CONFIG as any,
      },
    });

    this.logger.log(`Group ${groupId} initialized`);
  }

  async toggleFeature(
    groupId: string,
    featureName: keyof GroupConfigData["features"],
    enabled: boolean
  ): Promise<void> {
    const config = await this.getConfig(groupId);

    config.features[featureName] = enabled;

    await this.prisma.groupConfig.upsert({
      where: { groupId },
      update: { config: config as any },
      create: { groupId, config: config as any },
    });

    this.logger.log(
      `Feature ${featureName} ${enabled ? "enabled" : "disabled"} for ${groupId}`
    );
  }

  async setWelcomeMessage(groupId: string, message: string): Promise<void> {
    if (message.length > 500) {
      throw new BadRequestException("歡迎訊息不可超過 500 字元");
    }

    const config = await this.getConfig(groupId);
    config.welcomeMessage = message;

    await this.prisma.groupConfig.upsert({
      where: { groupId },
      update: { config: config as any },
      create: { groupId, config: config as any },
    });

    this.logger.log(`Welcome message updated for ${groupId}`);
  }

  async setCommandPrefix(groupId: string, prefix: string): Promise<void> {
    if (prefix.length !== 1) {
      throw new BadRequestException("指令前綴必須是單一字元");
    }

    const config = await this.getConfig(groupId);
    config.commandPrefix = prefix;

    await this.prisma.groupConfig.upsert({
      where: { groupId },
      update: { config: config as any },
      create: { groupId, config: config as any },
    });

    this.logger.log(`Command prefix updated to "${prefix}" for ${groupId}`);
  }

  async setCooldown(
    groupId: string,
    feature: keyof typeof MIN_COOLDOWNS,
    seconds: number
  ): Promise<void> {
    const minCooldown = MIN_COOLDOWNS[feature];

    if (seconds < minCooldown) {
      throw new BadRequestException(`冷卻時間不可低於 ${minCooldown} 秒`);
    }

    const config = await this.getConfig(groupId);

    if (!config.cooldowns) {
      config.cooldowns = {};
    }

    config.cooldowns[feature] = seconds;

    await this.prisma.groupConfig.upsert({
      where: { groupId },
      update: { config: config as any },
      create: { groupId, config: config as any },
    });

    this.logger.log(
      `Cooldown for ${feature} set to ${seconds}s for ${groupId}`
    );
  }

  async isFeatureEnabled(
    groupId: string,
    featureName: keyof GroupConfigData["features"]
  ): Promise<boolean> {
    const config = await this.getConfig(groupId);
    return config.features[featureName];
  }
}
