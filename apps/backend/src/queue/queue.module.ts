import { Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module";
import { QueueService } from "./queue.service";

@Module({
  imports: [RedisModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
