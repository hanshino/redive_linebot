import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../prisma/prisma.service";
import { EnsureWalletMiddleware } from "./ensure-wallet.middleware";
import type { MiddlewareContext, NextFunction } from "./middleware.types";

describe("EnsureWalletMiddleware", () => {
  let middleware: EnsureWalletMiddleware;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnsureWalletMiddleware,
        {
          provide: PrismaService,
          useValue: {
            userWallet: {
              findUnique: vi.fn(),
              create: vi.fn(),
            },
          },
        },
      ],
    }).compile();

    middleware = module.get<EnsureWalletMiddleware>(EnsureWalletMiddleware);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it("should be defined", () => {
    expect(middleware).toBeDefined();
  });

  it("should create wallet if it does not exist", async () => {
    const userId = "test-user-id";
    const mockContext = {
      event: {
        source: { userId },
      },
    } as unknown as MiddlewareContext;
    const mockNext: NextFunction = vi.fn();

    vi.spyOn(prismaService.userWallet, "findUnique").mockResolvedValue(null);
    vi.spyOn(prismaService.userWallet, "create").mockResolvedValue({
      userId,
      jewel: 0,
      stone: 0,
    } as any);

    await middleware.handle(mockContext, mockNext);

    expect(prismaService.userWallet.findUnique).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(prismaService.userWallet.create).toHaveBeenCalledWith({
      data: {
        userId,
        jewel: 0,
        stone: 0,
      },
    });
    expect(mockNext).toHaveBeenCalled();
  });

  it("should not create wallet if it already exists", async () => {
    const userId = "test-user-id";
    const mockContext = {
      event: {
        source: { userId },
      },
    } as unknown as MiddlewareContext;
    const mockNext: NextFunction = vi.fn();

    vi.spyOn(prismaService.userWallet, "findUnique").mockResolvedValue({
      userId,
      jewel: 100,
      stone: 50,
    } as any);
    const createSpy = vi.spyOn(prismaService.userWallet, "create");

    await middleware.handle(mockContext, mockNext);

    expect(prismaService.userWallet.findUnique).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(createSpy).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it("should skip wallet creation if userId is not present", async () => {
    const mockContext = {
      event: {
        source: {},
      },
    } as unknown as MiddlewareContext;
    const mockNext: NextFunction = vi.fn();

    const findSpy = vi.spyOn(prismaService.userWallet, "findUnique");
    const createSpy = vi.spyOn(prismaService.userWallet, "create");

    await middleware.handle(mockContext, mockNext);

    expect(findSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });
});
