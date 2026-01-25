import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service";
import { RedisService } from "../../src/redis/redis.service";
import { UserSyncProcessor } from "../../src/user-sync/user-sync.processor";
import { UserSyncService } from "../../src/user-sync/user-sync.service";

describe("UserSync Integration", () => {
  let userSyncService: UserSyncService;
  let processor: UserSyncProcessor;
  let mockPrisma: any;
  let mockRedis: any;
  let mockClient: any;

  beforeEach(async () => {
    mockPrisma = {
      lineUser: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };

    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      sadd: vi.fn(),
    };

    mockClient = {
      getProfile: vi.fn(),
      getGroupMemberProfile: vi.fn(),
      getRoomMemberProfile: vi.fn(),
    };

    const mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === "line.channelAccessToken") return "test_token";
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSyncService,
        UserSyncProcessor,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: RedisService,
          useValue: mockRedis,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    userSyncService = module.get<UserSyncService>(UserSyncService);
    processor = module.get<UserSyncProcessor>(UserSyncProcessor);

    (userSyncService as any).client = mockClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should complete full sync flow for new user", async () => {
    const userId = "U123";
    const mockProfile = {
      userId,
      displayName: "Test User",
      pictureUrl: "https://example.com/pic.jpg",
      statusMessage: "Hello",
      language: "en",
    };

    mockRedis.get.mockResolvedValue(null);
    mockPrisma.lineUser.findUnique.mockResolvedValue(null);
    mockClient.getProfile.mockResolvedValue(mockProfile);
    mockPrisma.lineUser.upsert.mockResolvedValue({});

    const exists = await userSyncService.checkUserExists(userId);
    expect(exists).toBe(false);

    const job = {
      data: {
        userId,
        context: { sourceType: "user" as const },
      },
    } as any;

    await processor.process(job);

    expect(mockClient.getProfile).toHaveBeenCalledWith(userId);
    expect(mockPrisma.lineUser.upsert).toHaveBeenCalledWith({
      where: { userId },
      update: expect.objectContaining({
        displayName: mockProfile.displayName,
      }),
      create: expect.objectContaining({
        userId,
        displayName: mockProfile.displayName,
      }),
    });
    expect(mockRedis.set).toHaveBeenCalledWith(
      `user:exists:${userId}`,
      "1",
      86400
    );
  });

  it("should handle existing user correctly", async () => {
    const userId = "U123";

    mockRedis.get.mockResolvedValue("1");

    const exists = await userSyncService.checkUserExists(userId);
    expect(exists).toBe(true);

    await userSyncService.markUserActive(userId);
    expect(mockRedis.sadd).toHaveBeenCalledWith("users:active:batch", userId);
  });

  it("should handle group context end-to-end", async () => {
    const userId = "U123";
    const groupId = "G456";
    const mockProfile = {
      userId,
      displayName: "Group User",
      pictureUrl: "https://example.com/pic.jpg",
      statusMessage: null,
      language: "ja",
    };

    mockClient.getGroupMemberProfile.mockResolvedValue(mockProfile);
    mockPrisma.lineUser.upsert.mockResolvedValue({});

    const job = {
      data: {
        userId,
        context: { sourceType: "group" as const, groupId },
      },
    } as any;

    await processor.process(job);

    expect(mockClient.getGroupMemberProfile).toHaveBeenCalledWith(
      groupId,
      userId
    );
    expect(mockPrisma.lineUser.upsert).toHaveBeenCalled();
  });

  it("should handle room context end-to-end", async () => {
    const userId = "U123";
    const roomId = "R789";
    const mockProfile = {
      userId,
      displayName: "Room User",
      pictureUrl: null,
      statusMessage: "Away",
      language: "zh-TW",
    };

    mockClient.getRoomMemberProfile.mockResolvedValue(mockProfile);
    mockPrisma.lineUser.upsert.mockResolvedValue({});

    const job = {
      data: {
        userId,
        context: { sourceType: "room" as const, roomId },
      },
    } as any;

    await processor.process(job);

    expect(mockClient.getRoomMemberProfile).toHaveBeenCalledWith(
      roomId,
      userId
    );
    expect(mockPrisma.lineUser.upsert).toHaveBeenCalled();
  });
});
