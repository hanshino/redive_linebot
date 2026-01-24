import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { QueueService } from "../../queue/queue.service";
import { SyncProfileJobData } from "../../user-sync/user-sync.processor";
import { UserSyncService } from "../../user-sync/user-sync.service";
import type {
  LineMiddleware,
  MiddlewareContext,
  NextFunction,
} from "./middleware.types";

@Injectable()
export class UserTrackMiddleware implements LineMiddleware {
  private readonly logger = new Logger(UserTrackMiddleware.name);
  private readonly queue: Queue<SyncProfileJobData>;

  constructor(
    private readonly userSyncService: UserSyncService,
    private readonly queueService: QueueService
  ) {
    this.queue = this.queueService.getQueue<SyncProfileJobData>("user-sync");
  }

  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    const userId = ctx.event.source?.userId;

    if (userId) {
      this.trackUser(userId, ctx).catch((error) => {
        this.logger.warn(`Failed to track user ${userId}:`, error);
      });
    }

    await next();
  }

  private async trackUser(
    userId: string,
    ctx: MiddlewareContext
  ): Promise<void> {
    const exists = await this.userSyncService.checkUserExists(userId);

    if (!exists) {
      const source = ctx.event.source;
      const context: SyncProfileJobData["context"] = {
        sourceType:
          source?.type === "group"
            ? "group"
            : source?.type === "room"
              ? "room"
              : "user",
        groupId: source?.type === "group" ? source.groupId : undefined,
        roomId: source?.type === "room" ? source.roomId : undefined,
      };

      await this.queue.add("sync-profile", { userId, context });
      this.logger.debug(`Queued profile sync for new user: ${userId}`);
    } else {
      await this.userSyncService.markUserActive(userId);
    }
  }
}
