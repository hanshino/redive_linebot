import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { MiddlewareRunner } from "../../src/line/middleware/middleware.runner";
import { LINE_MIDDLEWARES, MiddlewareContext, NextFunction } from "../../src/line/middleware/middleware.types";
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("MiddlewareRunner", () => {
  let runner: MiddlewareRunner;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MiddlewareRunner,
        {
          provide: LINE_MIDDLEWARES,
          useValue: [], // Start empty
        },
      ],
    }).compile();

    runner = module.get<MiddlewareRunner>(MiddlewareRunner);
  });

  it("should be defined", () => {
    expect(runner).toBeDefined();
  });

  it("should execute middlewares in onion order", async () => {
    const executionOrder: string[] = [];

    const mw1 = async (ctx: MiddlewareContext, next: NextFunction) => {
      executionOrder.push("mw1-start");
      await next();
      executionOrder.push("mw1-end");
    };

    const mw2 = async (ctx: MiddlewareContext, next: NextFunction) => {
      executionOrder.push("mw2-start");
      await next();
      executionOrder.push("mw2-end");
    };

    runner.use(mw1).use(mw2);

    const mockEvent = { type: "message", webhookEventId: "evt1" } as any;
    const result = await runner.run(mockEvent, "dest1");

    expect(result.success).toBe(true);
    expect(executionOrder).toEqual([
      "mw1-start",
      "mw2-start",
      "mw2-end",
      "mw1-end",
    ]);
  });

  it("should handle errors in middleware", async () => {
    const errorMw = async (ctx: MiddlewareContext, next: NextFunction) => {
      throw new Error("Middleware error");
    };

    runner.use(errorMw);

    const mockEvent = { type: "message", webhookEventId: "evt1" } as any;
    const result = await runner.run(mockEvent, "dest1");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe("Middleware error");
  });

  it("should support injected middlewares", async () => {
    const injectedMw = {
      handle: vi.fn(async (ctx, next) => await next()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MiddlewareRunner,
        {
          provide: LINE_MIDDLEWARES,
          useValue: [injectedMw],
        },
      ],
    }).compile();

    const injectedRunner = module.get<MiddlewareRunner>(MiddlewareRunner);
    const mockEvent = { type: "message", webhookEventId: "evt1" } as any;
    
    await injectedRunner.run(mockEvent, "dest1");
    expect(injectedMw.handle).toHaveBeenCalled();
  });
});
