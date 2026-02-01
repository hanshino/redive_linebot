import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ItemType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CeilingProgress,
  DrawnItem,
  GachaDrawResult,
  GachaPoolItemWithDef,
  GachaPoolWithItems,
  PoolConfig,
  ProcessedDrawResult,
} from "./types";

@Injectable()
export class GachaService {
  private readonly logger = new Logger(GachaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getActivePool(): Promise<GachaPoolWithItems | null> {
    const now = new Date();

    return await this.prisma.gachaPool.findFirst({
      where: {
        isActive: true,
        OR: [
          {
            AND: [{ startTime: { lte: now } }, { endTime: { gte: now } }],
          },
          {
            AND: [{ startTime: null }, { endTime: null }],
          },
        ],
      },
      orderBy: {
        priority: "desc",
      },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
    });
  }

  async performDraw(
    userId: string,
    poolId: number,
    count: 1 | 10
  ): Promise<GachaDrawResult> {
    const pool = await this.loadPoolWithItems(poolId);
    const config = pool.config as unknown as PoolConfig;

    const pointsToAdd = count;
    let totalCost = 0;
    let isFree = false;

    if (count === 10) {
      const hasFreeDraw = await this.checkAndConsumeFreeDraw(userId);
      if (hasFreeDraw) {
        isFree = true;
        this.logger.log(`User ${userId} used free daily draw`);
      } else {
        totalCost = config.cost * count;
      }
    } else {
      totalCost = config.cost * count;
    }

    return await this.prisma.$transaction(
      async (tx) => {
        await this.deductJewelInTx(tx, userId, totalCost);

        let results: DrawnItem[] = this.rollItems(pool.items, count);

        if (count === 10) {
          const has2StarOrHigher = results.some((r) => r.rarity >= 2);
          if (!has2StarOrHigher) {
            const highRarityItems = pool.items.filter(
              (i) => i.item.rarity >= 2
            );
            results[9] = this.rollSingleItem(highRarityItems);
            this.logger.debug(
              "Ten-pull guarantee triggered - re-rolled position 10"
            );
          }
        }

        const processedResults = await this.processDrawResults(
          tx,
          userId,
          results,
          config.conversionRate
        );

        await this.updateCeilingPoints(tx, userId, poolId, pointsToAdd, count);

        const wallet = await tx.userWallet.findUnique({
          where: { userId },
          select: { jewel: true },
        });

        return {
          items: processedResults,
          totalCost,
          newCeilingPoints: pointsToAdd,
          remainingJewels: wallet?.jewel ?? 0,
          isFree,
        };
      },
      { maxWait: 5000, timeout: 15000 }
    );
  }

  async getCeilingProgress(
    userId: string,
    poolId: number
  ): Promise<CeilingProgress> {
    const exchange = await this.prisma.gachaExchange.findUnique({
      where: {
        userId_poolId: {
          userId,
          poolId,
        },
      },
    });

    return {
      points: exchange?.points ?? 0,
      totalDraws: exchange?.totalDraws ?? 0,
      maxPoints: 200,
    };
  }

  async exchangeCeiling(
    userId: string,
    poolId: number,
    itemDefId: number
  ): Promise<void> {
    const pool = await this.loadPoolWithItems(poolId);
    const config = pool.config as unknown as PoolConfig;

    if (config.exchangeItems && !config.exchangeItems.includes(itemDefId)) {
      throw new BadRequestException(
        "This item is not available for ceiling exchange"
      );
    }

    const itemDef = await this.prisma.itemDefinition.findUnique({
      where: { id: itemDefId },
    });

    if (!itemDef || itemDef.rarity !== 3) {
      throw new BadRequestException("Only 3★ characters can be exchanged");
    }

    await this.prisma.$transaction(
      async (tx) => {
        const exchange = await tx.gachaExchange.findUnique({
          where: {
            userId_poolId: {
              userId,
              poolId,
            },
          },
        });

        if (!exchange || exchange.points < 200) {
          throw new BadRequestException(
            `天井點數不足！需要 200 點，目前只有 ${exchange?.points ?? 0} 點`
          );
        }

        await tx.gachaExchange.update({
          where: {
            userId_poolId: {
              userId,
              poolId,
            },
          },
          data: {
            points: { decrement: 200 },
          },
        });

        const isDuplicate = await this.checkDuplicateInTx(
          tx,
          userId,
          itemDefId
        );

        if (isDuplicate) {
          const stoneAmount = config.conversionRate["3"] || 50;
          await tx.userWallet.update({
            where: { userId },
            data: { stone: { increment: stoneAmount } },
          });

          this.logger.log(
            `Ceiling exchange: ${itemDef.name} is duplicate, converted to ${stoneAmount} stones`
          );
        } else {
          await tx.inventoryItem.create({
            data: {
              userId,
              itemDefId,
              amount: 1,
              properties: { level: 1, rank: 1, bond: 0, star: 3 },
            },
          });

          this.logger.log(
            `Ceiling exchange: ${itemDef.name} granted to ${userId}`
          );
        }
      },
      { maxWait: 5000, timeout: 10000 }
    );
  }

  private async loadPoolWithItems(poolId: number): Promise<GachaPoolWithItems> {
    const pool = await this.prisma.gachaPool.findUnique({
      where: { id: poolId },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!pool) {
      throw new BadRequestException(`Gacha pool not found: ${poolId}`);
    }

    if (!pool.isActive) {
      throw new BadRequestException("This gacha pool is not active");
    }

    return pool;
  }

  private async deductJewelInTx(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    userId: string,
    amount: number
  ): Promise<void> {
    if (amount === 0) {
      return;
    }

    const wallet = await tx.userWallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new BadRequestException(
        "Wallet not found. This should not happen - please contact support."
      );
    }

    if (wallet.jewel < amount) {
      throw new BadRequestException(
        `寶石不足！需要 ${amount} 寶石，目前只有 ${wallet.jewel} 寶石`
      );
    }

    await tx.userWallet.update({
      where: { userId },
      data: { jewel: { decrement: amount } },
    });
  }

  private rollItems(
    poolItems: GachaPoolItemWithDef[],
    count: number
  ): DrawnItem[] {
    const results: DrawnItem[] = [];

    for (let i = 0; i < count; i++) {
      results.push(this.rollSingleItem(poolItems));
    }

    return results;
  }

  private rollSingleItem(poolItems: GachaPoolItemWithDef[]): DrawnItem {
    const totalWeight = poolItems.reduce((sum, pi) => sum + pi.weight, 0);
    const roll = Math.floor(Math.random() * totalWeight);

    let cumulative = 0;
    for (const poolItem of poolItems) {
      cumulative += poolItem.weight;
      if (roll < cumulative) {
        return {
          itemDefId: poolItem.itemId,
          name: poolItem.item.name,
          rarity: poolItem.item.rarity,
          isPickup: poolItem.isPickup,
        };
      }
    }

    const fallback = poolItems[poolItems.length - 1];
    return {
      itemDefId: fallback.itemId,
      name: fallback.item.name,
      rarity: fallback.item.rarity,
      isPickup: fallback.isPickup,
    };
  }

  private async processDrawResults(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    userId: string,
    results: DrawnItem[],
    conversionRate: Record<string, number>
  ): Promise<ProcessedDrawResult[]> {
    const processed: ProcessedDrawResult[] = [];

    for (const item of results) {
      const isDuplicate = await this.checkDuplicateInTx(
        tx,
        userId,
        item.itemDefId
      );

      if (isDuplicate) {
        const stoneAmount = conversionRate[String(item.rarity)] || 1;
        await tx.userWallet.update({
          where: { userId },
          data: { stone: { increment: stoneAmount } },
        });

        processed.push({
          ...item,
          isDuplicate: true,
          stoneConverted: stoneAmount,
        });

        this.logger.debug(
          `Duplicate: ${item.name} (${item.rarity}★) → ${stoneAmount} stones`
        );
      } else {
        await tx.inventoryItem.create({
          data: {
            userId,
            itemDefId: item.itemDefId,
            amount: 1,
            properties: { level: 1, rank: 1, bond: 0, star: item.rarity },
          },
        });

        processed.push({
          ...item,
          isDuplicate: false,
          stoneConverted: 0,
        });

        this.logger.debug(
          `New: ${item.name} (${item.rarity}★) added to inventory`
        );
      }
    }

    return processed;
  }

  private async checkDuplicateInTx(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    userId: string,
    itemDefId: number
  ): Promise<boolean> {
    const itemDef = await tx.itemDefinition.findUnique({
      where: { id: itemDefId },
      select: { type: true },
    });

    if (!itemDef || itemDef.type !== ItemType.CHARACTER) {
      return false;
    }

    const existing = await tx.inventoryItem.findFirst({
      where: { userId, itemDefId },
      select: { id: true },
    });

    return !!existing;
  }

  private async updateCeilingPoints(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    userId: string,
    poolId: number,
    pointsToAdd: number,
    drawCount: number
  ): Promise<void> {
    await tx.gachaExchange.upsert({
      where: {
        userId_poolId: {
          userId,
          poolId,
        },
      },
      update: {
        points: { increment: pointsToAdd },
        totalDraws: { increment: drawCount },
      },
      create: {
        userId,
        poolId,
        points: pointsToAdd,
        totalDraws: drawCount,
      },
    });
  }

  private async checkAndConsumeFreeDraw(userId: string): Promise<boolean> {
    const today = this.getToday();

    const limit = await this.prisma.gachaDailyLimit.findUnique({
      where: { userId },
    });

    if (!limit || !this.isSameDay(limit.date, today)) {
      await this.prisma.gachaDailyLimit.upsert({
        where: { userId },
        create: {
          userId,
          date: today,
          freeDrawsUsed: 1,
        },
        update: {
          date: today,
          freeDrawsUsed: 1,
        },
      });
      return true;
    }

    const quota = this.getDailyQuota();
    if (limit.freeDrawsUsed < quota) {
      await this.prisma.gachaDailyLimit.update({
        where: { userId },
        data: {
          freeDrawsUsed: { increment: 1 },
        },
      });
      return true;
    }

    return false;
  }

  private getDailyQuota(): number {
    return 1;
  }

  private getToday(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  async getFreeDrawStatus(userId: string): Promise<{
    hasFreeDraw: boolean;
    quota: number;
    used: number;
    resetTime: Date;
  }> {
    const today = this.getToday();
    const quota = this.getDailyQuota();

    const limit = await this.prisma.gachaDailyLimit.findUnique({
      where: { userId },
    });

    let used = 0;
    if (limit && this.isSameDay(limit.date, today)) {
      used = limit.freeDrawsUsed;
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return {
      hasFreeDraw: used < quota,
      quota,
      used,
      resetTime: tomorrow,
    };
  }
}
