import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CommandContext,
  CommandHandler,
} from "../../src/line/commands/interfaces/command-handler.interface";
import { CommandDispatcherMiddleware } from "../../src/line/commands/middleware/command-dispatcher.middleware";
import { CommandDiscoveryService } from "../../src/line/commands/services/command-discovery.service";
import type {
  MiddlewareContext,
  NextFunction,
} from "../../src/line/middleware/middleware.types";
import type {
  MessageEvent,
  PostbackEvent,
  WebhookEvent,
} from "../../src/line/types/events";

describe("CommandDispatcherMiddleware", () => {
  let middleware: CommandDispatcherMiddleware;
  let mockCommandDiscovery: {
    findCommandHandler: ReturnType<typeof vi.fn>;
    findRegexCommandHandler: ReturnType<typeof vi.fn>;
    findPostbackHandler: ReturnType<typeof vi.fn>;
    findEventHandlers: ReturnType<typeof vi.fn>;
  };
  let mockNext: NextFunction;
  let mockLogger: Logger;

  const createMockHandler = (
    methodName: string,
    controllerName = "TestController"
  ): CommandHandler => ({
    controllerName,
    methodName,
    instance: {},
    method: vi.fn(),
    options: { command: "test" },
    type: "command",
  });

  const createTextMessageEvent = (text: string): MessageEvent => ({
    type: "message",
    message: {
      type: "text",
      id: "msg1",
      text,
      quoteToken: "qt123",
    },
    timestamp: Date.now(),
    source: {
      type: "user",
      userId: "U123",
    },
    replyToken: "reply123",
    mode: "active",
    webhookEventId: "evt1",
    deliveryContext: {
      isRedelivery: false,
    },
  });

  const createPostbackEvent = (data: string): PostbackEvent => ({
    type: "postback",
    postback: {
      data,
    },
    timestamp: Date.now(),
    source: {
      type: "user",
      userId: "U123",
    },
    replyToken: "reply123",
    mode: "active",
    webhookEventId: "evt2",
    deliveryContext: {
      isRedelivery: false,
    },
  });

  const createFollowEvent = (): WebhookEvent => ({
    type: "follow",
    timestamp: Date.now(),
    source: {
      type: "user",
      userId: "U123",
    },
    replyToken: "reply123",
    mode: "active",
    webhookEventId: "evt3",
    deliveryContext: {
      isRedelivery: false,
    },
    follow: {
      isUnblocked: false,
    },
  });

  const createMockContext = (event: WebhookEvent): MiddlewareContext => ({
    event,
    destination: "bot123",
    replyToken:
      "replyToken" in event && event.replyToken ? event.replyToken : null,
    state: new Map(),
    logger: mockLogger,
  });

  beforeEach(async () => {
    vi.spyOn(Logger.prototype, "debug").mockImplementation(() => {});
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});

    mockCommandDiscovery = {
      findCommandHandler: vi.fn(),
      findRegexCommandHandler: vi.fn(),
      findPostbackHandler: vi.fn(),
      findEventHandlers: vi.fn().mockReturnValue([]),
    };

    mockNext = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommandDispatcherMiddleware,
        {
          provide: CommandDiscoveryService,
          useValue: mockCommandDiscovery,
        },
      ],
    }).compile();

    middleware = module.get<CommandDispatcherMiddleware>(
      CommandDispatcherMiddleware
    );
    mockLogger = (middleware as any).logger;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(middleware).toBeDefined();
  });

  describe("handleTextMessage", () => {
    it("should handle string command without prefix", async () => {
      const handler = createMockHandler("handleTest");
      mockCommandDiscovery.findCommandHandler.mockReturnValue(handler);

      const event = createTextMessageEvent("test arg1 arg2");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockCommandDiscovery.findCommandHandler).toHaveBeenCalledWith(
        "test arg1 arg2"
      );
      expect(handler.method).toHaveBeenCalledWith(
        expect.objectContaining({
          commandContext: expect.objectContaining({
            event,
            rawText: "test arg1 arg2",
            args: ["test", "arg1", "arg2"],
          }),
        })
      );
    });

    it("should handle command with # prefix", async () => {
      const handler = createMockHandler("handleTest");
      mockCommandDiscovery.findCommandHandler.mockReturnValue(handler);

      const event = createTextMessageEvent("#test arg1");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockCommandDiscovery.findCommandHandler).toHaveBeenCalledWith(
        "test arg1"
      );
    });

    it("should handle command with / prefix", async () => {
      const handler = createMockHandler("handleTest");
      mockCommandDiscovery.findCommandHandler.mockReturnValue(handler);

      const event = createTextMessageEvent("/test");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockCommandDiscovery.findCommandHandler).toHaveBeenCalledWith(
        "test"
      );
    });

    it("should handle command with . prefix", async () => {
      const handler = createMockHandler("handleTest");
      mockCommandDiscovery.findCommandHandler.mockReturnValue(handler);

      const event = createTextMessageEvent(".test");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockCommandDiscovery.findCommandHandler).toHaveBeenCalledWith(
        "test"
      );
    });

    it("should handle command with ! prefix", async () => {
      const handler = createMockHandler("handleTest");
      mockCommandDiscovery.findCommandHandler.mockReturnValue(handler);

      const event = createTextMessageEvent("!test");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockCommandDiscovery.findCommandHandler).toHaveBeenCalledWith(
        "test"
      );
    });

    it("should fallback to regex command if string command not found", async () => {
      const handler = createMockHandler("handleRegex");
      const match = ["roll 2d6", "2", "6"] as RegExpMatchArray;
      match.index = 0;
      match.input = "roll 2d6";

      mockCommandDiscovery.findCommandHandler.mockReturnValue(null);
      mockCommandDiscovery.findRegexCommandHandler.mockReturnValue({
        handler,
        match,
      });

      const event = createTextMessageEvent("roll 2d6");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockCommandDiscovery.findRegexCommandHandler).toHaveBeenCalledWith(
        "roll 2d6"
      );
      expect(handler.method).toHaveBeenCalledWith(
        expect.objectContaining({
          commandContext: expect.objectContaining({
            event,
            rawText: "roll 2d6",
            match,
          }),
        })
      );
    });

    it("should log debug message if no handler found", async () => {
      mockCommandDiscovery.findCommandHandler.mockReturnValue(null);
      mockCommandDiscovery.findRegexCommandHandler.mockReturnValue(null);

      const event = createTextMessageEvent("unknown");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('No handler found for text: "unknown"')
      );
    });

    it("should not handle non-text messages", async () => {
      const event: MessageEvent = {
        type: "message",
        message: {
          type: "image",
          id: "msg1",
          contentProvider: {
            type: "line",
          },
          quoteToken: "qt123",
        },
        timestamp: Date.now(),
        source: {
          type: "user",
          userId: "U123",
        },
        replyToken: "reply123",
        mode: "active",
        webhookEventId: "evt1",
        deliveryContext: {
          isRedelivery: false,
        },
      };
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockCommandDiscovery.findCommandHandler).not.toHaveBeenCalled();
    });
  });

  describe("handlePostback", () => {
    it("should handle postback with JSON action", async () => {
      const handler = createMockHandler("handleBuy");
      mockCommandDiscovery.findPostbackHandler.mockReturnValue(handler);

      const event = createPostbackEvent(JSON.stringify({ action: "buy" }));
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockCommandDiscovery.findPostbackHandler).toHaveBeenCalledWith(
        "buy"
      );
      expect(handler.method).toHaveBeenCalled();
    });

    it("should handle postback with query string action", async () => {
      const handler = createMockHandler("handleSell");
      mockCommandDiscovery.findPostbackHandler.mockReturnValue(handler);

      const event = createPostbackEvent("action=sell&itemId=123");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockCommandDiscovery.findPostbackHandler).toHaveBeenCalledWith(
        "sell"
      );
    });

    it("should warn if postback data is invalid", async () => {
      const event = createPostbackEvent("invalid data");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Invalid postback data")
      );
    });

    it("should log debug if no handler found for postback", async () => {
      mockCommandDiscovery.findPostbackHandler.mockReturnValue(null);

      const event = createPostbackEvent(JSON.stringify({ action: "unknown" }));
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          'No handler found for postback action: "unknown"'
        )
      );
    });
  });

  describe("handleGenericEvent", () => {
    it("should handle follow event", async () => {
      const handler = createMockHandler("handleFollow");
      mockCommandDiscovery.findEventHandlers.mockReturnValue([handler]);

      const event = createFollowEvent();
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockCommandDiscovery.findEventHandlers).toHaveBeenCalledWith(
        "follow"
      );
      expect(handler.method).toHaveBeenCalled();
    });

    it("should handle multiple handlers for same event", async () => {
      const handler1 = createMockHandler("handler1");
      const handler2 = createMockHandler("handler2");
      mockCommandDiscovery.findEventHandlers.mockReturnValue([
        handler1,
        handler2,
      ]);

      const event = createFollowEvent();
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(handler1.method).toHaveBeenCalled();
      expect(handler2.method).toHaveBeenCalled();
    });

    it("should log debug if no handler found for event", async () => {
      mockCommandDiscovery.findEventHandlers.mockReturnValue([]);

      const event = createFollowEvent();
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("No handler found for event type: follow")
      );
    });
  });

  describe("error handling", () => {
    it("should throw error if handler execution fails", async () => {
      const handler = createMockHandler("handleTest");
      const error = new Error("Handler failed");
      (handler.method as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      mockCommandDiscovery.findCommandHandler.mockReturnValue(handler);

      const event = createTextMessageEvent("test");
      const ctx = createMockContext(event);

      await expect(middleware.handle(ctx, mockNext)).rejects.toThrow(
        "Handler failed"
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Handler execution failed"),
        expect.any(String)
      );
    });

    it("should handle non-Error exceptions", async () => {
      const handler = createMockHandler("handleTest");
      (handler.method as ReturnType<typeof vi.fn>).mockRejectedValue(
        "String error"
      );

      mockCommandDiscovery.findCommandHandler.mockReturnValue(handler);

      const event = createTextMessageEvent("test");
      const ctx = createMockContext(event);

      await expect(middleware.handle(ctx, mockNext)).rejects.toBe(
        "String error"
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Handler execution failed"),
        "String error"
      );
    });
  });

  describe("argument parsing", () => {
    it("should parse arguments with multiple spaces", async () => {
      const handler = createMockHandler("handleTest");
      mockCommandDiscovery.findCommandHandler.mockReturnValue(handler);

      const event = createTextMessageEvent("test   arg1    arg2");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      const callArgs = (handler.method as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        commandContext: CommandContext;
      };
      expect(callArgs.commandContext.args).toEqual(["test", "arg1", "arg2"]);
    });

    it("should handle empty arguments", async () => {
      const handler = createMockHandler("handleTest");
      mockCommandDiscovery.findCommandHandler.mockReturnValue(handler);

      const event = createTextMessageEvent("test");
      const ctx = createMockContext(event);

      await middleware.handle(ctx, mockNext);

      const callArgs = (handler.method as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        commandContext: CommandContext;
      };
      expect(callArgs.commandContext.args).toEqual(["test"]);
    });
  });
});
