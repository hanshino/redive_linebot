import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  LineMiddleware,
  MiddlewareContext,
  NextFunction,
} from "./middleware.types";

@Injectable()
export class EnsureWalletMiddleware implements LineMiddleware {
  private readonly logger = new Logger(EnsureWalletMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    const userId = ctx.event.source?.userId;

    if (userId) {
      await this.ensureWalletExists(userId);
    }

    await next();
  }

  private async ensureWalletExists(userId: string): Promise<void> {
    const existingWallet = await this.prisma.userWallet.findUnique({
      where: { userId },
    });

    if (!existingWallet) {
      await this.prisma.userWallet.create({
        data: {
          userId,
          jewel: 0,
          stone: 0,
        },
      });
      this.logger.log(`Auto-initialized wallet for user: ${userId}`);
    }
  }
}
