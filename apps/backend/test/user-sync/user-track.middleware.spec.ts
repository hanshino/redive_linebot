import { Test, TestingModule } from "@nestjs/testing";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MiddlewareContext } from "../../src/line/middleware/middleware.types";
import { UserTrackMiddleware } from "../../src/line/middleware/user-track.middleware";
import { QueueService } from "../../src/queue/queue.service";
import { UserSyncService } from "../../src/user-sync/user-sync.service";

describe("UserTrackMiddleware", () => {
  let middleware: UserTrackMiddleware;
  let mockUserSyncService: any;
  let mockQueue: any;

  const mockQueueService = {
    getQueue: vi.fn(),
  };

  beforeEach(async () => {
    mockUserSyncService = {
      checkUserExists: vi.fn(),
      markUserActive: vi.fn(),
    };

    mockQueue = {
      add: vi.fn(),
    };

    mockQueueService.getQueue.mockReturnValue(mockQueue);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTrackMiddleware,
        {
          provide: UserSyncService,
          useValue: mockUserSyncService,
        },
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
      ],
    }).compile();

    middleware = module.get<UserTrackMiddleware>(UserTrackMiddleware);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(middleware).toBeDefined();
  });

  describe("handle", () => {
    it("should track user and call next for user source", async () => {
      const next = vi.fn();
      const context: MiddlewareContext = {
        event: {
          type: "message",
          source: {
            type: "user",
            userId: "U123",
          },
        } as any,
        destination: "dest",
        replyToken: "token",
        state: new Map(),
        logger: { log: vi.fn() } as any,
      };

      mockUserSyncService.checkUserExists.mockResolvedValue(true);

      await middleware.handle(context, next);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(next).toHaveBeenCalled();
      expect(mockUserSyncService.checkUserExists).toHaveBeenCalledWith("U123");
      expect(mockUserSyncService.markUserActive).toHaveBeenCalledWith("U123");
    });

    it("should queue sync job for new user", async () => {
      const next = vi.fn();
      const context: MiddlewareContext = {
        event: {
          type: "message",
          source: {
            type: "user",
            userId: "U123",
          },
        } as any,
        destination: "dest",
        replyToken: "token",
        state: new Map(),
        logger: { log: vi.fn() } as any,
      };

      mockUserSyncService.checkUserExists.mockResolvedValue(false);

      await middleware.handle(context, next);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(next).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith("sync-profile", {
        userId: "U123",
        context: {
          sourceType: "user",
          groupId: undefined,
          roomId: undefined,
        },
      });
    });

    it("should handle group source correctly", async () => {
      const next = vi.fn();
      const context: MiddlewareContext = {
        event: {
          type: "message",
          source: {
            type: "group",
            userId: "U123",
            groupId: "G456",
          },
        } as any,
        destination: "dest",
        replyToken: "token",
        state: new Map(),
        logger: { log: vi.fn() } as any,
      };

      mockUserSyncService.checkUserExists.mockResolvedValue(false);

      await middleware.handle(context, next);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockQueue.add).toHaveBeenCalledWith("sync-profile", {
        userId: "U123",
        context: {
          sourceType: "group",
          groupId: "G456",
          roomId: undefined,
        },
      });
    });

    it("should handle room source correctly", async () => {
      const next = vi.fn();
      const context: MiddlewareContext = {
        event: {
          type: "message",
          source: {
            type: "room",
            userId: "U123",
            roomId: "R789",
          },
        } as any,
        destination: "dest",
        replyToken: "token",
        state: new Map(),
        logger: { log: vi.fn() } as any,
      };

      mockUserSyncService.checkUserExists.mockResolvedValue(false);

      await middleware.handle(context, next);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockQueue.add).toHaveBeenCalledWith("sync-profile", {
        userId: "U123",
        context: {
          sourceType: "room",
          groupId: undefined,
          roomId: "R789",
        },
      });
    });

    it("should not block next() even if tracking fails", async () => {
      const next = vi.fn();
      const context: MiddlewareContext = {
        event: {
          type: "message",
          source: {
            type: "user",
            userId: "U123",
          },
        } as any,
        destination: "dest",
        replyToken: "token",
        state: new Map(),
        logger: { log: vi.fn() } as any,
      };

      mockUserSyncService.checkUserExists.mockRejectedValue(
        new Error("Redis error")
      );

      await middleware.handle(context, next);

      expect(next).toHaveBeenCalled();
    });

    it("should skip tracking if no userId in event", async () => {
      const next = vi.fn();
      const context: MiddlewareContext = {
        event: {
          type: "follow",
        } as any,
        destination: "dest",
        replyToken: "token",
        state: new Map(),
        logger: { log: vi.fn() } as any,
      };

      await middleware.handle(context, next);

      expect(next).toHaveBeenCalled();
      expect(mockUserSyncService.checkUserExists).not.toHaveBeenCalled();
    });
  });
});
