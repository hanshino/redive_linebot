import { Module, Global } from "@nestjs/common";
import { GroupConfigService } from "./group-config.service";
import { PrismaModule } from "../prisma/prisma.module";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [GroupConfigService],
  exports: [GroupConfigService],
})
export class GroupConfigModule {}
