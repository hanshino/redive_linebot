import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verify() {
  console.log("🔍 Verifying Gacha & Inventory System Setup...\n");

  const characters = await prisma.itemDefinition.count({
    where: { type: "CHARACTER" },
  });
  console.log(`✅ Characters: ${characters}/15`);

  const oneStarCount = await prisma.itemDefinition.count({
    where: { type: "CHARACTER", rarity: 1 },
  });
  const twoStarCount = await prisma.itemDefinition.count({
    where: { type: "CHARACTER", rarity: 2 },
  });
  const threeStarCount = await prisma.itemDefinition.count({
    where: { type: "CHARACTER", rarity: 3 },
  });

  console.log(`   - 1★: ${oneStarCount}/5`);
  console.log(`   - 2★: ${twoStarCount}/7`);
  console.log(`   - 3★: ${threeStarCount}/3`);

  const pools = await prisma.gachaPool.count();
  console.log(`\n✅ Gacha Pools: ${pools}/1`);

  const poolItems = await prisma.gachaPoolItem.count();
  console.log(`✅ Pool Items: ${poolItems}/15`);

  const weights = await prisma.gachaPoolItem.findMany({
    include: {
      item: true,
    },
  });

  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  const oneStarWeight = weights
    .filter((item) => item.item.rarity === 1)
    .reduce((sum, item) => sum + item.weight, 0);
  const twoStarWeight = weights
    .filter((item) => item.item.rarity === 2)
    .reduce((sum, item) => sum + item.weight, 0);
  const threeStarWeight = weights
    .filter((item) => item.item.rarity === 3)
    .reduce((sum, item) => sum + item.weight, 0);

  console.log(`\n📊 Weight Distribution:`);
  console.log(`   - Total: ${totalWeight}/10000 ✅`);
  console.log(
    `   - 1★: ${oneStarWeight} (${(oneStarWeight / 100).toFixed(1)}%)`
  );
  console.log(
    `   - 2★: ${twoStarWeight} (${(twoStarWeight / 100).toFixed(1)}%)`
  );
  console.log(
    `   - 3★: ${threeStarWeight} (${(threeStarWeight / 100).toFixed(1)}%)`
  );

  const adminUser = await prisma.lineUser.findUnique({
    where: { userId: "U_ADMIN_TEST" },
    include: {
      permissions: true,
      wallet: true,
    },
  });

  console.log(`\n✅ Admin User: ${adminUser ? "Found" : "Not Found"}`);
  if (adminUser) {
    console.log(`   - Display Name: ${adminUser.displayName}`);
    console.log(
      `   - Permissions: ${adminUser.permissions.map((p) => p.role).join(", ")}`
    );
    if (adminUser.wallet) {
      console.log(`   - Jewel: ${adminUser.wallet.jewel}`);
      console.log(`   - Stone: ${adminUser.wallet.stone}`);
      console.log(`   - Mana: ${adminUser.wallet.mana}`);
    }
  }

  console.log("\n✨ Verification complete!");
  console.log(
    "\n🎮 You can now open Prisma Studio at http://localhost:51212 to view the data."
  );
}

verify()
  .catch((e) => {
    console.error("❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
