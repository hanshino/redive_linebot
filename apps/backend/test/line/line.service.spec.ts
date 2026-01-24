import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LineService } from "../../src/line/line.service";

// Mock @line/bot-sdk
vi.mock("@line/bot-sdk", () => ({
  messagingApi: {
    MessagingApiClient: vi.fn().mockImplementation(function () {
      return {
        replyMessage: vi.fn().mockResolvedValue({}),
        pushMessage: vi.fn().mockResolvedValue({}),
      };
    }),
  },
}));

describe("LineService", () => {
  let service: LineService;
  let mockClient: any;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === "line.channelAccessToken") return "test_token";
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LineService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LineService>(LineService);
    mockClient = (service as any).client;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should send reply message", async () => {
    const replyToken = "token";
    const messages = [{ type: "text", text: "hello" }] as any;

    await service.replyMessage(replyToken, messages);

    expect(mockClient.replyMessage).toHaveBeenCalledWith({
      replyToken,
      messages,
    });
  });

  it("should send push message", async () => {
    const to = "userId";
    const messages = [{ type: "text", text: "hello" }] as any;

    await service.pushMessage(to, messages);

    expect(mockClient.pushMessage).toHaveBeenCalledWith({
      to,
      messages,
    });
  });

  it("should handle error in replyMessage", async () => {
    mockClient.replyMessage.mockRejectedValue(new Error("API Error"));
    const result = await service.replyMessage("token", []);
    expect(result).toBeNull();
  });
});
