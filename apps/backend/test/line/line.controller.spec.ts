import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignatureGuard } from "../../src/line/guards/signature.guard";
import { LineController } from "../../src/line/line.controller";
import { MiddlewareRunner } from "../../src/line/middleware/middleware.runner";
import { IdempotencyService } from "../../src/line/services/idempotency.service";

describe("LineController", () => {
  let controller: LineController;
  let middlewareRunner: MiddlewareRunner;
  let idempotencyService: IdempotencyService;

  const mockMiddlewareRunner = {
    run: vi.fn().mockResolvedValue({ success: true, eventId: "evt1" }),
  };

  const mockIdempotencyService = {
    isProcessed: vi.fn().mockResolvedValue(false), // Default: new event
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LineController],
      providers: [
        {
          provide: MiddlewareRunner,
          useValue: mockMiddlewareRunner,
        },
        {
          provide: IdempotencyService,
          useValue: mockIdempotencyService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    })
      .overrideGuard(SignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LineController>(LineController);
    middlewareRunner = module.get<MiddlewareRunner>(MiddlewareRunner);
    idempotencyService = module.get<IdempotencyService>(IdempotencyService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should return OK and process events", async () => {
    const body = {
      destination: "dest1",
      events: [
        { type: "message", webhookEventId: "evt1" },
        { type: "follow", webhookEventId: "evt2" },
      ],
    };

    const result = await controller.handleWebhook(body as any);

    expect(result).toBe("OK");
    expect(middlewareRunner.run).toHaveBeenCalledTimes(2);
    expect(middlewareRunner.run).toHaveBeenCalledWith(body.events[0], "dest1");
    expect(middlewareRunner.run).toHaveBeenCalledWith(body.events[1], "dest1");
  });

  it("should handle empty events (ping)", async () => {
    const body = {
      destination: "dest1",
      events: [],
    };

    const result = await controller.handleWebhook(body as any);

    expect(result).toBe("OK");
    expect(middlewareRunner.run).not.toHaveBeenCalled();
  });

  it("should handle unknown event types gracefully", async () => {
    const body = {
      destination: "dest1",
      events: [{ type: "unknown_type", webhookEventId: "evt_unknown" }],
    };

    const result = await controller.handleWebhook(body as any);

    expect(result).toBe("OK");
    expect(middlewareRunner.run).toHaveBeenCalledWith(body.events[0], "dest1");
  });

  it("should skip duplicate events", async () => {
    (mockIdempotencyService.isProcessed as any).mockResolvedValueOnce(true); // evt1 is duplicate

    const body = {
      destination: "dest1",
      events: [{ type: "message", webhookEventId: "evt1" }],
    };

    const result = await controller.handleWebhook(body as any);

    expect(result).toBe("OK");
    expect(middlewareRunner.run).not.toHaveBeenCalled();
    expect(mockIdempotencyService.isProcessed).toHaveBeenCalledWith("evt1");
  });
});
