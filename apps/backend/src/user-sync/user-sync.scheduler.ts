import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Queue } from "bullmq";
import { QueueService } from "../queue/queue.service";
import { SyncProfileJobData } from "./user-sync.processor";
import { UserSyncService } from "./user-sync.service";

@Injectable()
export class UserSyncScheduler {
  private readonly logger = new Logger(UserSyncScheduler.name);
  private readonly queue: Queue<SyncProfileJobData>;

  constructor(
    private readonly userSyncService: UserSyncService,
    private readonly queueService: QueueService
  ) {
    this.queue = this.queueService.getQueue<SyncProfileJobData>("user-sync");
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async batchUpdateActivity() {
    const count = await this.userSyncService.batchUpdateLastSeen();
    if (count > 0) {
      this.logger.log(`Batch updated ${count} active users`);
    }
  }

  @Cron("0 3 * * *")
  async refreshStaleProfiles() {
    const staleUserIds = await this.userSyncService.findStaleProfiles(7);

    for (const userId of staleUserIds) {
      await this.queue.add("sync-profile", {
        userId,
        context: { sourceType: "user" },
      });
    }

    this.logger.log(`Queued ${staleUserIds.length} stale profiles for refresh`);
  }
}
