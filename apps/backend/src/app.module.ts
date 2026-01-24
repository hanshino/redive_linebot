import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { PermissionModule } from "./permission/permission.module";
import { GroupConfigModule } from "./group-config/group-config.module";
import { LineModule } from "./line/line.module";
import configuration from "./config/configuration";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [".env", "../../.env"],
    }),
    PrismaModule,
    RedisModule,
    PermissionModule,
    GroupConfigModule,
    HealthModule,
    LineModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
