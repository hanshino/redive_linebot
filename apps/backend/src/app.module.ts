import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import configuration from "./config/configuration";
import { GachaModule } from "./gacha/gacha.module";
import { GroupConfigModule } from "./group-config/group-config.module";
import { HealthModule } from "./health/health.module";
import { InventoryModule } from "./inventory/inventory.module";
import { LineModule } from "./line/line.module";
import { PermissionModule } from "./permission/permission.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { RedisModule } from "./redis/redis.module";
import { UserSyncModule } from "./user-sync/user-sync.module";
import { WalletModule } from "./wallet/wallet.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [".env", "../../.env"],
      expandVariables: true,
    }),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
      },
    }),
    PrismaModule,
    RedisModule,
    QueueModule,
    UserSyncModule,
    PermissionModule,
    GroupConfigModule,
    WalletModule,
    InventoryModule,
    GachaModule,
    HealthModule,
    LineModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
