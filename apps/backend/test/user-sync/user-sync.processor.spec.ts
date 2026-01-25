import { Test, TestingModule } from "@nestjs/testing";
import { Job } from "bullmq";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserSyncProcessor } from "../../src/user-sync/user-sync.processor";
import { UserSyncService } from "../../src/user-sync/user-sync.service";

describe("UserSyncProcessor", () => {
  let processor: UserSyncProcessor;
  let mockUserSyncService: any;

  beforeEach(async () => {
    mockUserSyncService = {
      fetchProfile: vi.fn(),
      syncUserProfile: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSyncProcessor,
        {
          provide: UserSyncService,
          useValue: mockUserSyncService,
        },
      ],
    }).compile();

    processor = module.get<UserSyncProcessor>(UserSyncProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(processor).toBeDefined();
  });

  describe("process", () => {
    it("should fetch and sync user profile successfully", async () => {
      const job = {
        data: {
          userId: "U123",
          context: {
            sourceType: "user" as const,
          },
        },
      } as Job;

      const mockProfile = {
        userId: "U123",
        displayName: "Test User",
        pictureUrl: "https://example.com/pic.jpg",
        statusMessage: "Hello",
        language: "en",
      };

      mockUserSyncService.fetchProfile.mockResolvedValue(mockProfile);

      await processor.process(job);

      expect(mockUserSyncService.fetchProfile).toHaveBeenCalledWith("U123", {
        sourceType: "user",
      });
      expect(mockUserSyncService.syncUserProfile).toHaveBeenCalledWith(
        "U123",
        mockProfile
      );
    });

    it("should handle group context", async () => {
      const job = {
        data: {
          userId: "U123",
          context: {
            sourceType: "group" as const,
            groupId: "G456",
          },
        },
      } as Job;

      const mockProfile = {
        userId: "U123",
        displayName: "Test User",
        pictureUrl: "https://example.com/pic.jpg",
        statusMessage: "Hello",
        language: "en",
      };

      mockUserSyncService.fetchProfile.mockResolvedValue(mockProfile);

      await processor.process(job);

      expect(mockUserSyncService.fetchProfile).toHaveBeenCalledWith("U123", {
        sourceType: "group",
        groupId: "G456",
      });
    });

    it("should handle room context", async () => {
      const job = {
        data: {
          userId: "U123",
          context: {
            sourceType: "room" as const,
            roomId: "R789",
          },
        },
      } as Job;

      const mockProfile = {
        userId: "U123",
        displayName: "Test User",
        pictureUrl: "https://example.com/pic.jpg",
        statusMessage: "Hello",
        language: "en",
      };

      mockUserSyncService.fetchProfile.mockResolvedValue(mockProfile);

      await processor.process(job);

      expect(mockUserSyncService.fetchProfile).toHaveBeenCalledWith("U123", {
        sourceType: "room",
        roomId: "R789",
      });
    });

    it("should throw error if profile fetch fails", async () => {
      const job = {
        data: {
          userId: "U123",
          context: {
            sourceType: "user" as const,
          },
        },
      } as Job;

      mockUserSyncService.fetchProfile.mockResolvedValue(null);

      await expect(processor.process(job)).rejects.toThrow(
        "Failed to fetch profile for user U123"
      );
    });

    it("should not call syncUserProfile if fetch returns null", async () => {
      const job = {
        data: {
          userId: "U123",
          context: {
            sourceType: "user" as const,
          },
        },
      } as Job;

      mockUserSyncService.fetchProfile.mockResolvedValue(null);

      try {
        await processor.process(job);
      } catch (error) {}

      expect(mockUserSyncService.syncUserProfile).not.toHaveBeenCalled();
    });
  });
});
