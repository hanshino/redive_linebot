import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WalletService } from "./wallet.service";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
