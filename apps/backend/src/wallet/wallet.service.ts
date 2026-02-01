import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { UserWallet } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get or create user wallet
   * @param userId LINE user ID
   * @returns User wallet with all currency balances
   */
  async getWallet(userId: string): Promise<UserWallet> {
    return await this.prisma.userWallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        jewel: 0,
        stone: 0,
        mana: BigInt(0),
      },
    });
  }

  /**
   * Add jewel to user wallet (admin rewards, purchases)
   * @param userId LINE user ID
   * @param amount Amount to add (must be positive)
   * @returns Updated wallet
   */
  async addJewel(userId: string, amount: number): Promise<UserWallet> {
    if (amount <= 0) {
      throw new BadRequestException("Amount must be positive");
    }

    const wallet = await this.prisma.userWallet.upsert({
      where: { userId },
      update: { jewel: { increment: amount } },
      create: {
        userId,
        jewel: amount,
        stone: 0,
        mana: BigInt(0),
      },
    });

    this.logger.log(
      `Added ${amount} jewel to ${userId}, new balance: ${wallet.jewel}`
    );
    return wallet;
  }

  /**
   * Deduct jewel from user wallet (gacha cost, purchases)
   * Uses transaction to prevent race conditions
   * @param userId LINE user ID
   * @param amount Amount to deduct (must be positive)
   * @throws BadRequestException if insufficient balance
   * @returns Updated wallet
   */
  async deductJewel(userId: string, amount: number): Promise<UserWallet> {
    if (amount <= 0) {
      throw new BadRequestException("Amount must be positive");
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // Lock the row and check balance
        const wallet = await tx.userWallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new BadRequestException(
            "Wallet not found. Please contact support."
          );
        }

        if (wallet.jewel < amount) {
          throw new BadRequestException(
            `寶石不足！需要 ${amount} 寶石，目前只有 ${wallet.jewel} 寶石`
          );
        }

        // Atomic decrement
        const updated = await tx.userWallet.update({
          where: { userId },
          data: { jewel: { decrement: amount } },
        });

        this.logger.debug(
          `Deducted ${amount} jewel from ${userId}, remaining: ${updated.jewel}`
        );

        return updated;
      },
      { maxWait: 5000, timeout: 10000 }
    );
  }

  /**
   * Add divine stone to user wallet (duplicate compensation, ceiling expiry)
   * @param userId LINE user ID
   * @param amount Amount to add (must be positive)
   * @returns Updated wallet
   */
  async addStone(userId: string, amount: number): Promise<UserWallet> {
    if (amount <= 0) {
      throw new BadRequestException("Amount must be positive");
    }

    const wallet = await this.prisma.userWallet.upsert({
      where: { userId },
      update: { stone: { increment: amount } },
      create: {
        userId,
        jewel: 0,
        stone: amount,
        mana: BigInt(0),
      },
    });

    this.logger.log(
      `Added ${amount} stone to ${userId}, new balance: ${wallet.stone}`
    );
    return wallet;
  }

  /**
   * Add mana to user wallet (quest rewards, etc.)
   * @param userId LINE user ID
   * @param amount Amount to add (BigInt for large numbers)
   * @returns Updated wallet
   */
  async addMana(userId: string, amount: bigint): Promise<UserWallet> {
    if (amount <= 0n) {
      throw new BadRequestException("Amount must be positive");
    }

    const wallet = await this.prisma.userWallet.upsert({
      where: { userId },
      update: { mana: { increment: amount } },
      create: {
        userId,
        jewel: 0,
        stone: 0,
        mana: amount,
      },
    });

    this.logger.log(
      `Added ${amount} mana to ${userId}, new balance: ${wallet.mana}`
    );
    return wallet;
  }

  /**
   * Get current balances for user
   * @param userId LINE user ID
   * @returns Currency balances
   */
  async getBalance(userId: string): Promise<{
    jewel: number;
    stone: number;
    mana: bigint;
    coins: any;
  }> {
    const wallet = await this.getWallet(userId);
    return {
      jewel: wallet.jewel,
      stone: wallet.stone,
      mana: wallet.mana,
      coins: wallet.coins,
    };
  }
}
