import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { IdempotencyService } from "../../src/line/services/idempotency.service";
import { RedisService } from "../../src/redis/redis.service";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

describe("IdempotencyService", () => {
  let service: IdempotencyService;
  let mockRedisClient: any;

  const mockRedisService = {
    getClient: vi.fn(() => mockRedisClient),
  };

  beforeEach(async () => {
    mockRedisClient = {
      set: vi.fn(),
    };
    mockRedisService.getClient.mockReturnValue(mockRedisClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should return true if event is new", async () => {
    mockRedisClient.set.mockResolvedValue("OK");

    const result = await service.isProcessed("evt1");

    expect(result).toBe(false); // Not processed yet
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      "line:event:evt1",
      "1",
      "EX",
      86400,
      "NX"
    );
  });

  it("should return true if event is already processed", async () => {
    mockRedisClient.set.mockResolvedValue(null);

    const result = await service.isProcessed("evt1");

    expect(result).toBe(true); // Already processed
  });
});
