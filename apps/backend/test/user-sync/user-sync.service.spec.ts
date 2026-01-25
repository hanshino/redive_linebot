import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service";
import { RedisService } from "../../src/redis/redis.service";
import { UserSyncService } from "../../src/user-sync/user-sync.service";

// Mock @line/bot-sdk
vi.mock("@line/bot-sdk", () => ({
  messagingApi: {
    MessagingApiClient: vi.fn().mockImplementation(function () {
      return {
        getProfile: vi.fn(),
        getGroupMemberProfile: vi.fn(),
        getRoomMemberProfile: vi.fn(),
      };
    }),
  },
}));

describe("UserSyncService", () => {
  let service: UserSyncService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockClient: any;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === "line.channelAccessToken") return "test_token";
      return null;
    }),
  };

  beforeEach(async () => {
    mockPrisma = {
      lineUser: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        findMany: vi.fn(),
      },
      $executeRaw: vi.fn(),
    };

    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      sadd: vi.fn(),
      smembers: vi.fn(),
      del: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSyncService,
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

    service = module.get<UserSyncService>(UserSyncService);
    mockClient = (service as any).client;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("checkUserExists", () => {
    it("should return true if user exists in cache", async () => {
      mockRedis.get.mockResolvedValue("1");

      const result = await service.checkUserExists("U123");

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith("user:exists:U123");
      expect(mockPrisma.lineUser.findUnique).not.toHaveBeenCalled();
    });

    it("should query database if cache miss and return true", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.lineUser.findUnique.mockResolvedValue({
        userId: "U123",
      });

      const result = await service.checkUserExists("U123");

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith("user:exists:U123");
      expect(mockPrisma.lineUser.findUnique).toHaveBeenCalledWith({
        where: { userId: "U123" },
        select: { userId: true },
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        "user:exists:U123",
        "1",
        86400
      );
    });

    it("should return false if user not found in database", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.lineUser.findUnique.mockResolvedValue(null);

      const result = await service.checkUserExists("U123");

      expect(result).toBe(false);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe("fetchProfile", () => {
    const mockProfile = {
      userId: "U123",
      displayName: "Test User",
      pictureUrl: "https://example.com/pic.jpg",
      statusMessage: "Hello",
      language: "en",
    };

    it("should fetch user profile for direct user context", async () => {
      mockClient.getProfile.mockResolvedValue(mockProfile);

      const result = await service.fetchProfile("U123", {
        sourceType: "user",
      });

      expect(result).toEqual(mockProfile);
      expect(mockClient.getProfile).toHaveBeenCalledWith("U123");
    });

    it("should fetch group member profile for group context", async () => {
      mockClient.getGroupMemberProfile.mockResolvedValue(mockProfile);

      const result = await service.fetchProfile("U123", {
        sourceType: "group",
        groupId: "G456",
      });

      expect(result).toEqual(mockProfile);
      expect(mockClient.getGroupMemberProfile).toHaveBeenCalledWith(
        "G456",
        "U123"
      );
    });

    it("should fetch room member profile for room context", async () => {
      mockClient.getRoomMemberProfile.mockResolvedValue(mockProfile);

      const result = await service.fetchProfile("U123", {
        sourceType: "room",
        roomId: "R789",
      });

      expect(result).toEqual(mockProfile);
      expect(mockClient.getRoomMemberProfile).toHaveBeenCalledWith(
        "R789",
        "U123"
      );
    });

    it("should return null on API error", async () => {
      mockClient.getProfile.mockRejectedValue(new Error("API Error"));

      const result = await service.fetchProfile("U123", {
        sourceType: "user",
      });

      expect(result).toBeNull();
    });
  });

  describe("syncUserProfile", () => {
    const profileData = {
      userId: "U123",
      displayName: "Test User",
      pictureUrl: "https://example.com/pic.jpg",
      statusMessage: "Hello",
      language: "en",
    };

    it("should upsert user profile to database", async () => {
      mockPrisma.lineUser.upsert.mockResolvedValue({});

      await service.syncUserProfile("U123", profileData);

      expect(mockPrisma.lineUser.upsert).toHaveBeenCalledWith({
        where: { userId: "U123" },
        update: {
          displayName: "Test User",
          pictureUrl: "https://example.com/pic.jpg",
          statusMessage: "Hello",
          language: "en",
          lastSeenAt: expect.any(Date),
        },
        create: {
          userId: "U123",
          displayName: "Test User",
          pictureUrl: "https://example.com/pic.jpg",
          statusMessage: "Hello",
          language: "en",
        },
      });
    });

    it("should update Redis cache after sync", async () => {
      mockPrisma.lineUser.upsert.mockResolvedValue({});

      await service.syncUserProfile("U123", profileData);

      expect(mockRedis.set).toHaveBeenCalledWith(
        "user:exists:U123",
        "1",
        86400
      );
    });
  });

  describe("markUserActive", () => {
    it("should add user to active batch set", async () => {
      await service.markUserActive("U123");

      expect(mockRedis.sadd).toHaveBeenCalledWith("users:active:batch", "U123");
    });
  });

  describe("batchUpdateLastSeen", () => {
    it("should update lastSeenAt for all active users", async () => {
      const activeUsers = ["U123", "U456", "U789"];
      mockRedis.smembers.mockResolvedValue(activeUsers);
      mockPrisma.$executeRaw.mockResolvedValue(3);

      const count = await service.batchUpdateLastSeen();

      expect(mockRedis.smembers).toHaveBeenCalledWith("users:active:batch");
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith("users:active:batch");
      expect(count).toBe(3);
    });

    it("should return 0 if no active users", async () => {
      mockRedis.smembers.mockResolvedValue([]);

      const count = await service.batchUpdateLastSeen();

      expect(count).toBe(0);
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe("findStaleProfiles", () => {
    it("should return user IDs with outdated profiles", async () => {
      const staleUsers = [{ userId: "U123" }, { userId: "U456" }];
      mockPrisma.lineUser.findMany.mockResolvedValue(staleUsers);

      const result = await service.findStaleProfiles(7);

      expect(result).toEqual(["U123", "U456"]);
      expect(mockPrisma.lineUser.findMany).toHaveBeenCalledWith({
        where: {
          updatedAt: {
            lt: expect.any(Date),
          },
        },
        select: { userId: true },
      });
    });

    it("should use default 7 days if not specified", async () => {
      mockPrisma.lineUser.findMany.mockResolvedValue([]);

      await service.findStaleProfiles();

      expect(mockPrisma.lineUser.findMany).toHaveBeenCalled();
    });
  });
});
