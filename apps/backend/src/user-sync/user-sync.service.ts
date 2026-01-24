import { Injectable, Logger } from "@nestjs/common";
import { messagingApi } from "@line/bot-sdk";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

export interface UserProfileData {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
  language?: string;
}

export interface FetchProfileContext {
  sourceType: "user" | "group" | "room";
  groupId?: string;
  roomId?: string;
}

@Injectable()
export class UserSyncService {
  private readonly logger = new Logger(UserSyncService.name);
  private readonly client: messagingApi.MessagingApiClient;
  private readonly USER_EXISTS_CACHE_TTL = 86400;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    const channelAccessToken = this.config.get<string>(
      "line.channelAccessToken",
    );
    if (!channelAccessToken) {
      throw new Error("LINE channel access token not configured");
    }
    this.client = new messagingApi.MessagingApiClient({ channelAccessToken });
  }

  async checkUserExists(userId: string): Promise<boolean> {
    const cacheKey = `user:exists:${userId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return true;
    }

    const user = await this.prisma.lineUser.findUnique({
      where: { userId },
      select: { userId: true },
    });

    if (user) {
      await this.redis.set(cacheKey, "1", this.USER_EXISTS_CACHE_TTL);
      return true;
    }

    return false;
  }

  async fetchProfile(
    userId: string,
    context: FetchProfileContext,
  ): Promise<UserProfileData | null> {
    try {
      let profile: messagingApi.UserProfileResponse;

      if (context.sourceType === "group" && context.groupId) {
        profile = await this.client.getGroupMemberProfile(
          context.groupId,
          userId,
        );
      } else if (context.sourceType === "room" && context.roomId) {
        profile = await this.client.getRoomMemberProfile(
          context.roomId,
          userId,
        );
      } else {
        profile = await this.client.getProfile(userId);
      }

      return {
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
        statusMessage: profile.statusMessage,
        language: profile.language,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch profile for ${userId}:`, error);
      return null;
    }
  }

  async syncUserProfile(
    userId: string,
    profileData: UserProfileData,
  ): Promise<void> {
    await this.prisma.lineUser.upsert({
      where: { userId },
      update: {
        displayName: profileData.displayName,
        pictureUrl: profileData.pictureUrl,
        statusMessage: profileData.statusMessage,
        language: profileData.language,
        lastSeenAt: new Date(),
      },
      create: {
        userId: profileData.userId,
        displayName: profileData.displayName,
        pictureUrl: profileData.pictureUrl,
        statusMessage: profileData.statusMessage,
        language: profileData.language,
      },
    });

    const cacheKey = `user:exists:${userId}`;
    await this.redis.set(cacheKey, "1", this.USER_EXISTS_CACHE_TTL);

    this.logger.debug(
      `User profile synced: ${userId} (${profileData.displayName})`,
    );
  }

  async markUserActive(userId: string): Promise<void> {
    await this.redis.sadd("users:active:batch", userId);
  }

  async batchUpdateLastSeen(): Promise<number> {
    const activeUsers = await this.redis.smembers("users:active:batch");

    if (activeUsers.length === 0) {
      return 0;
    }

    await this.prisma.$executeRaw`
      UPDATE line_users 
      SET last_seen_at = NOW() 
      WHERE user_id = ANY(${activeUsers})
    `;

    await this.redis.del("users:active:batch");

    this.logger.log(`Batch updated lastSeenAt for ${activeUsers.length} users`);
    return activeUsers.length;
  }

  async findStaleProfiles(daysOld: number = 7): Promise<string[]> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const staleUsers = await this.prisma.lineUser.findMany({
      where: {
        updatedAt: {
          lt: cutoffDate,
        },
      },
      select: { userId: true },
    });

    return staleUsers.map((u: { userId: string }) => u.userId);
  }
}
