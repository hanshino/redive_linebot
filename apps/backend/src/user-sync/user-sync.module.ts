import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UserSyncService } from './user-sync.service';
import { UserSyncProcessor } from './user-sync.processor';
import { UserSyncScheduler } from './user-sync.scheduler';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    QueueModule,
    BullModule.registerQueue({
      name: 'user-sync',
    }),
  ],
  providers: [UserSyncService, UserSyncProcessor, UserSyncScheduler],
  exports: [UserSyncService],
})
export class UserSyncModule {}
