import { Test, TestingModule } from "@nestjs/testing";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LineService } from "../../src/line/line.service";
import { EchoMiddleware } from "../../src/line/middleware/echo.middleware";
import { MiddlewareContext } from "../../src/line/middleware/middleware.types";

describe("EchoMiddleware", () => {
  let middleware: EchoMiddleware;
  let lineService: LineService;

  const mockLineService = {
    replyText: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EchoMiddleware,
        {
          provide: LineService,
          useValue: mockLineService,
        },
      ],
    }).compile();

    middleware = module.get<EchoMiddleware>(EchoMiddleware);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(middleware).toBeDefined();
  });

  it("should echo text message", async () => {
    const next = vi.fn();
    const context: MiddlewareContext = {
      event: {
        type: "message",
        message: { type: "text", text: "hello" },
      } as any,
      destination: "dest",
      replyToken: "token",
      state: new Map(),
      logger: { log: vi.fn() } as any,
    };

    await middleware.handle(context, next);

    expect(mockLineService.replyText).toHaveBeenCalledWith("token", "hello");
    expect(next).toHaveBeenCalled();
  });

  it("should ignore non-text messages", async () => {
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

    expect(mockLineService.replyText).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
