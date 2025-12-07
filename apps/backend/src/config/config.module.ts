import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import configuration from "./configuration";

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [".env", "../../.env"],
    }),
  ],
})
export class ConfigModule {}
