import { validateSignature } from "@line/bot-sdk";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignatureGuard } from "../../src/line/guards/signature.guard";

// Mock @line/bot-sdk
vi.mock("@line/bot-sdk", () => ({
  validateSignature: vi.fn(),
}));

describe("SignatureGuard", () => {
  let guard: SignatureGuard;
  let configService: ConfigService;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === "line.channelSecret") return "test_channel_secret";
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignatureGuard,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    guard = module.get<SignatureGuard>(SignatureGuard);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  it("should throw error if channel secret is missing", () => {
    mockConfigService.get.mockReturnValueOnce(null);
    expect(() => new SignatureGuard(mockConfigService as any)).toThrow(
      "LINE_CHANNEL_SECRET is not configured"
    );
  });

  it("should validate valid signature", async () => {
    (validateSignature as any).mockReturnValue(true);

    const context = createMockContext(
      {
        "x-line-signature": "valid_signature",
      },
      Buffer.from("body")
    );

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(validateSignature).toHaveBeenCalledWith(
      "body",
      "test_channel_secret",
      "valid_signature"
    );
  });

  it("should throw UnauthorizedException for missing signature header", async () => {
    const context = createMockContext({}, Buffer.from("body"));

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("should throw UnauthorizedException for missing raw body", async () => {
    const context = createMockContext(
      {
        "x-line-signature": "valid_signature",
      },
      undefined
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("should throw UnauthorizedException for invalid signature", async () => {
    (validateSignature as any).mockReturnValue(false);

    const context = createMockContext(
      {
        "x-line-signature": "invalid_signature",
      },
      Buffer.from("body")
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
  });

  function createMockContext(headers: any, rawBody: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          rawBody,
        }),
      }),
    } as any;
  }
});
