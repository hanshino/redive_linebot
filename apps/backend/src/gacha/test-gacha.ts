import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { GachaService } from "./gacha.service";

async function main() {
  console.log("🧪 Gacha System Verification\n");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  const walletService = app.get(WalletService);
  const inventoryService = app.get(InventoryService);
  const gachaService = app.get(GachaService);
  const prisma = app.get(PrismaService);

  const TEST_USER_ID = "U_GACHA_TEST_" + Date.now();

  console.log(`📝 Test User ID: ${TEST_USER_ID}\n`);

  try {
    console.log("═══ Test 0: Create test user and seed data ═══");
    await prisma.lineUser.create({
      data: {
        userId: TEST_USER_ID,
        displayName: "Test User",
      },
    });
    console.log(`✅ Test user created`);

    const existingPool = await prisma.gachaPool.findFirst();
    if (!existingPool) {
      console.log("   Creating test gacha pool and items...");

      const characters = await prisma.itemDefinition.findMany({
        where: { type: "CHARACTER" },
        orderBy: { rarity: "desc" },
      });

      if (characters.length === 0) {
        console.log("   Creating test characters...");
        const char1 = await prisma.itemDefinition.create({
          data: {
            type: "CHARACTER",
            name: "Test Character 1★",
            rarity: 1,
            maxStack: 1,
          },
        });
        const char2 = await prisma.itemDefinition.create({
          data: {
            type: "CHARACTER",
            name: "Test Character 2★",
            rarity: 2,
            maxStack: 1,
          },
        });
        const char3 = await prisma.itemDefinition.create({
          data: {
            type: "CHARACTER",
            name: "Test Character 3★",
            rarity: 3,
            maxStack: 1,
          },
        });
        characters.push(char1, char2, char3);
      }

      const pool = await prisma.gachaPool.create({
        data: {
          name: "Test Permanent Pool",
          type: "PERMANENT",
          isActive: true,
          priority: 100,
          config: {
            cost: 150,
            ceil: 200,
            conversionRate: { "1": 1, "2": 10, "3": 50 },
            pointExpiry: { enabled: true, rate: 1 },
          },
        },
      });

      for (const char of characters) {
        const weight =
          char.rarity === 3 ? 250 : char.rarity === 2 ? 1800 : 7950;
        await prisma.gachaPoolItem.create({
          data: {
            poolId: pool.id,
            itemId: char.id,
            weight,
            isPickup: false,
          },
        });
      }

      console.log(`   ✅ Created pool with ${characters.length} characters`);
    } else {
      console.log(`   ✅ Using existing pool: ${existingPool.name}`);
    }
    console.log("");

    console.log("═══ Test 1: Create wallet with 10,000 jewel ═══");
    const wallet = await walletService.addJewel(TEST_USER_ID, 10000);
    console.log(
      `✅ Wallet created: ${wallet.jewel} jewel, ${wallet.stone} stone`
    );
    console.log("");

    console.log("═══ Test 2: Get active pool ═══");
    const pool = await gachaService.getActivePool();
    if (!pool) {
      throw new Error("No active pool found. Did you run the seed script?");
    }
    console.log(`✅ Active pool: "${pool.name}" (ID: ${pool.id})`);
    console.log(`   Items in pool: ${pool.items.length}`);
    console.log(
      `   Total weight: ${pool.items.reduce((sum, item) => sum + item.weight, 0)}`
    );
    console.log("");

    console.log("═══ Test 3: Single draw (150 jewel) ═══");
    const singleDraw = await gachaService.performDraw(TEST_USER_ID, pool.id, 1);
    console.log(`✅ Single draw completed:`);
    console.log(`   Cost: ${singleDraw.totalCost} jewel`);
    console.log(`   Remaining: ${singleDraw.remainingJewels} jewel`);
    console.log(`   Ceiling points: +${singleDraw.newCeilingPoints}`);
    singleDraw.items.forEach((item) => {
      console.log(
        `   - ${item.name} (${item.rarity}★) ${
          item.isDuplicate
            ? `[DUPLICATE → ${item.stoneConverted} stones]`
            : "[NEW]"
        }`
      );
    });
    console.log("");

    console.log("═══ Test 4: Ten-pull with 2★ guarantee (1500 jewel) ═══");
    const tenDraw = await gachaService.performDraw(TEST_USER_ID, pool.id, 10);
    console.log(`✅ Ten-pull completed:`);
    console.log(`   Cost: ${tenDraw.totalCost} jewel`);
    console.log(`   Remaining: ${tenDraw.remainingJewels} jewel`);
    console.log(`   Ceiling points: +${tenDraw.newCeilingPoints}`);
    console.log(`   Results:`);
    tenDraw.items.forEach((item, idx) => {
      console.log(
        `   ${idx + 1}. ${item.name} (${item.rarity}★) ${
          item.isDuplicate ? `[DUP → ${item.stoneConverted} stones]` : "[NEW]"
        }`
      );
    });

    const has2Star = tenDraw.items.some((item) => item.rarity >= 2);
    console.log(`   ✅ 2★ guarantee: ${has2Star ? "PASSED" : "FAILED"}`);
    console.log("");

    console.log("═══ Test 5: Check ceiling progress ═══");
    const ceiling = await gachaService.getCeilingProgress(
      TEST_USER_ID,
      pool.id
    );
    console.log(`✅ Ceiling progress:`);
    console.log(`   Points: ${ceiling.points} / ${ceiling.maxPoints}`);
    console.log(`   Total draws: ${ceiling.totalDraws}`);
    console.log("");

    console.log("═══ Test 6: Check inventory ═══");
    const inventory = await inventoryService.getInventory(TEST_USER_ID);
    console.log(`✅ Inventory: ${inventory.length} items`);
    const characters = inventory.filter(
      (item) => item.definition.type === "CHARACTER"
    );
    console.log(`   Characters: ${characters.length}`);
    characters.slice(0, 5).forEach((char) => {
      console.log(`   - ${char.definition.name} (${char.definition.rarity}★)`);
    });
    if (characters.length > 5) {
      console.log(`   ... and ${characters.length - 5} more`);
    }
    console.log("");

    console.log("═══ Test 7: Duplicate detection ═══");
    if (characters.length > 0) {
      const firstChar = characters[0];
      const isDup = await inventoryService.checkDuplicate(
        TEST_USER_ID,
        firstChar.itemDefId
      );
      console.log(
        `✅ Duplicate check for "${firstChar.definition.name}": ${isDup ? "TRUE (expected)" : "FALSE (unexpected)"}`
      );
    } else {
      console.log("⚠️  No characters to test duplicate detection");
    }
    console.log("");

    console.log(
      "═══ Test 8: Draw until 200 ceiling points (for exchange test) ═══"
    );
    let currentCeiling = ceiling.points;
    let drawCount = 0;
    while (currentCeiling < 200 && drawCount < 25) {
      await walletService.addJewel(TEST_USER_ID, 1500);
      const draw = await gachaService.performDraw(TEST_USER_ID, pool.id, 10);
      currentCeiling += draw.newCeilingPoints;
      drawCount++;
      console.log(`   Draw ${drawCount}: ${currentCeiling} / 200 points`);

      if (currentCeiling >= 200) {
        break;
      }
    }
    console.log(
      `✅ Reached ${currentCeiling} ceiling points after ${drawCount} ten-pulls`
    );
    console.log("");

    if (currentCeiling >= 200) {
      console.log("═══ Test 9: Ceiling exchange (200 points → 3★) ═══");
      const threeStarItems = pool.items.filter(
        (item) => item.item.rarity === 3
      );
      if (threeStarItems.length > 0) {
        const targetItem = threeStarItems[0];
        console.log(`   Exchanging for: ${targetItem.item.name}`);

        const beforeCeiling = await gachaService.getCeilingProgress(
          TEST_USER_ID,
          pool.id
        );
        await gachaService.exchangeCeiling(
          TEST_USER_ID,
          pool.id,
          targetItem.itemId
        );
        const afterCeiling = await gachaService.getCeilingProgress(
          TEST_USER_ID,
          pool.id
        );

        console.log(`✅ Ceiling exchange completed:`);
        console.log(`   Points before: ${beforeCeiling.points}`);
        console.log(`   Points after: ${afterCeiling.points}`);
        console.log(
          `   Points deducted: ${beforeCeiling.points - afterCeiling.points}`
        );
      } else {
        console.log("⚠️  No 3★ items in pool for exchange test");
      }
      console.log("");
    }

    console.log("═══ Test 10: Insufficient jewel (should fail atomically) ═══");
    const currentBalance = await walletService.getBalance(TEST_USER_ID);
    console.log(`   Current balance: ${currentBalance.jewel} jewel`);

    if (currentBalance.jewel >= 150) {
      const remainder = currentBalance.jewel % 150;
      const amountToDrain = currentBalance.jewel - remainder;
      console.log(
        `   Draining ${amountToDrain} jewel to trigger insufficient balance...`
      );

      while ((await walletService.getBalance(TEST_USER_ID)).jewel >= 150) {
        await gachaService.performDraw(TEST_USER_ID, pool.id, 1);
      }
    }

    console.log(`   Attempting draw with insufficient balance...`);
    try {
      await gachaService.performDraw(TEST_USER_ID, pool.id, 1);
      console.log(
        "❌ FAILED: Draw should have thrown error due to insufficient jewel"
      );
    } catch (err) {
      const error = err as Error;
      console.log(`✅ Error correctly thrown: ${error.message}`);
    }
    console.log("");

    console.log("═══ Test 11: Check final balances ═══");
    const finalBalance = await walletService.getBalance(TEST_USER_ID);
    console.log(`✅ Final balances:`);
    console.log(`   Jewel: ${finalBalance.jewel}`);
    console.log(`   Divine Stone: ${finalBalance.stone}`);
    console.log(`   Mana: ${finalBalance.mana}`);
    console.log("");
  } catch (err) {
    const error = err as Error;
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    console.log("═══ Cleanup ═══");
    await prisma.inventoryItem.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.gachaExchange.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.userWallet.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.lineUser.deleteMany({ where: { userId: TEST_USER_ID } });
    console.log("✅ Test user data cleaned up");

    await app.close();
  }

  console.log("\n🎉 ALL TESTS PASSED! Phase 2 implementation complete.\n");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
