import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { GachaService } from "./gacha.service";

describe("GachaService - Free Draw", () => {
  let service: GachaService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GachaService,
        {
          provide: PrismaService,
          useValue: {
            gachaDailyLimit: {
              findUnique: vi.fn(),
              upsert: vi.fn(),
              update: vi.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<GachaService>(GachaService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("getFreeDrawStatus", () => {
    it("should return available free draw for new user", async () => {
      vi.spyOn(prisma.gachaDailyLimit, "findUnique").mockResolvedValue(null);

      const status = await service.getFreeDrawStatus("test-user");

      expect(status.hasFreeDraw).toBe(true);
      expect(status.quota).toBe(1);
      expect(status.used).toBe(0);
      expect(status.resetTime).toBeInstanceOf(Date);
    });

    it("should return no free draw if quota used", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      vi.spyOn(prisma.gachaDailyLimit, "findUnique").mockResolvedValue({
        userId: "test-user",
        date: today,
        freeDrawsUsed: 1,
        updatedAt: new Date(),
      });

      const status = await service.getFreeDrawStatus("test-user");

      expect(status.hasFreeDraw).toBe(false);
      expect(status.quota).toBe(1);
      expect(status.used).toBe(1);
    });

    it("should reset if date is different", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      vi.spyOn(prisma.gachaDailyLimit, "findUnique").mockResolvedValue({
        userId: "test-user",
        date: yesterday,
        freeDrawsUsed: 1,
        updatedAt: new Date(),
      });

      const status = await service.getFreeDrawStatus("test-user");

      expect(status.hasFreeDraw).toBe(true);
      expect(status.used).toBe(0);
    });
  });

  describe("getDailyQuota", () => {
    it("should return 1 for regular user", () => {
      const quota = service["getDailyQuota"]();
      expect(quota).toBe(1);
    });
  });
});
