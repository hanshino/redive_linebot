import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WalletModule } from "../wallet/wallet.module";
import { GachaService } from "./gacha.service";

@Module({
  imports: [PrismaModule, WalletModule, InventoryModule],
  providers: [GachaService],
  exports: [GachaService],
})
export class GachaModule {}
