import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { RedisModule } from "../redis/redis.module";
import { UserSyncProcessor } from "./user-sync.processor";
import { UserSyncScheduler } from "./user-sync.scheduler";
import { UserSyncService } from "./user-sync.service";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    QueueModule,
    BullModule.registerQueue({
      name: "user-sync",
    }),
  ],
  providers: [UserSyncService, UserSyncProcessor, UserSyncScheduler],
  exports: [UserSyncService],
})
export class UserSyncModule {}
