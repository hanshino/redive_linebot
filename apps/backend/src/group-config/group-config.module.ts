import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { GroupConfigService } from "./group-config.service";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [GroupConfigService],
  exports: [GroupConfigService],
})
export class GroupConfigModule {}
