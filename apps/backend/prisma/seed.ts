import { ItemType, PoolType, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seed script for Gacha & Inventory System
 *
 * This script populates:
 * 1. Item definitions (15 characters with varied rarities)
 * 2. Default permanent gacha pool with correct weight distribution
 * 3. Admin test user with BOT_ADMIN permissions
 */
async function main() {
  console.log("🌱 Starting seed process...");

  // ============================================================================
  // 1. Create Item Definitions (Characters)
  // ============================================================================

  console.log("\n📦 Creating character definitions...");

  const characters = [
    // 1★ Characters (5 total) - Common
    {
      id: 2001,
      type: ItemType.CHARACTER,
      name: "佩可莉姆 (Pecorine)",
      description: "美食殿堂的大胃王會長",
      rarity: 1,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2001.png",
      meta: {
        isPrincess: false,
        alias: ["佩可", "吃貨會長"],
        baseStats: { hp: 450, atk: 50, def: 8, magicDef: 8 },
      },
    },
    {
      id: 2002,
      type: ItemType.CHARACTER,
      name: "凱留 (Karyl)",
      description: "美食殿堂的毒舌魔法使",
      rarity: 1,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2002.png",
      meta: {
        isPrincess: false,
        alias: ["凱留", "黑貓"],
        baseStats: { hp: 300, atk: 30, def: 5, magicDef: 12 },
      },
    },
    {
      id: 2003,
      type: ItemType.CHARACTER,
      name: "可可蘿 (Kokkoro)",
      description: "美食殿堂的萬能輔助",
      rarity: 1,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2003.png",
      meta: {
        isPrincess: false,
        alias: ["可可蘿", "媽媽"],
        baseStats: { hp: 350, atk: 40, def: 7, magicDef: 10 },
      },
    },
    {
      id: 2004,
      type: ItemType.CHARACTER,
      name: "優衣 (Yui)",
      description: "治癒系的溫柔少女",
      rarity: 1,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2004.png",
      meta: {
        isPrincess: false,
        alias: ["優衣", "奶媽"],
        baseStats: { hp: 400, atk: 35, def: 6, magicDef: 11 },
      },
    },
    {
      id: 2005,
      type: ItemType.CHARACTER,
      name: "怜 (Rei)",
      description: "冷酷的暗殺者",
      rarity: 1,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2005.png",
      meta: {
        isPrincess: false,
        alias: ["怜", "暗殺者"],
        baseStats: { hp: 280, atk: 70, def: 4, magicDef: 6 },
      },
    },

    // 2★ Characters (7 total) - Uncommon
    {
      id: 2101,
      type: ItemType.CHARACTER,
      name: "真步 (Mahiru)",
      description: "開朗的弓箭手",
      rarity: 2,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2101.png",
      meta: {
        isPrincess: false,
        alias: ["真步"],
        baseStats: { hp: 320, atk: 55, def: 5, magicDef: 7 },
      },
    },
    {
      id: 2102,
      type: ItemType.CHARACTER,
      name: "璃乃 (Rino)",
      description: "魔法少女",
      rarity: 2,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2102.png",
      meta: {
        isPrincess: false,
        alias: ["璃乃"],
        baseStats: { hp: 290, atk: 32, def: 5, magicDef: 13 },
      },
    },
    {
      id: 2103,
      type: ItemType.CHARACTER,
      name: "香織 (Kaori)",
      description: "劍術高手",
      rarity: 2,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2103.png",
      meta: {
        isPrincess: false,
        alias: ["香織"],
        baseStats: { hp: 330, atk: 60, def: 6, magicDef: 6 },
      },
    },
    {
      id: 2104,
      type: ItemType.CHARACTER,
      name: "雪 (Miyuki)",
      description: "冰雪魔法使",
      rarity: 2,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2104.png",
      meta: {
        isPrincess: false,
        alias: ["雪", "深月"],
        baseStats: { hp: 310, atk: 28, def: 4, magicDef: 14 },
      },
    },
    {
      id: 2105,
      type: ItemType.CHARACTER,
      name: "茜里 (Akari)",
      description: "熱血的拳擊手",
      rarity: 2,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2105.png",
      meta: {
        isPrincess: false,
        alias: ["茜里"],
        baseStats: { hp: 380, atk: 65, def: 7, magicDef: 5 },
      },
    },
    {
      id: 2106,
      type: ItemType.CHARACTER,
      name: "美咲 (Misaki)",
      description: "神秘的魔法少女",
      rarity: 2,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2106.png",
      meta: {
        isPrincess: false,
        alias: ["美咲"],
        baseStats: { hp: 305, atk: 33, def: 5, magicDef: 12 },
      },
    },
    {
      id: 2107,
      type: ItemType.CHARACTER,
      name: "純 (Jun)",
      description: "堅毅的盾衛士",
      rarity: 2,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2107.png",
      meta: {
        isPrincess: false,
        alias: ["純"],
        baseStats: { hp: 480, atk: 45, def: 10, magicDef: 9 },
      },
    },

    // 3★ Characters (3 total) - Rare
    {
      id: 2201,
      type: ItemType.CHARACTER,
      name: "新春凱留 (New Year Karyl)",
      description: "新年祭典的特別凱留",
      rarity: 3,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2201.png",
      meta: {
        isPrincess: true,
        alias: ["新春凱留", "新年黑貓"],
        baseStats: { hp: 380, atk: 48, def: 7, magicDef: 16 },
      },
    },
    {
      id: 2202,
      type: ItemType.CHARACTER,
      name: "萬聖節美咲 (Halloween Misaki)",
      description: "萬聖節活動限定角色",
      rarity: 3,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2202.png",
      meta: {
        isPrincess: true,
        alias: ["萬聖美咲", "南瓜魔女"],
        baseStats: { hp: 340, atk: 42, def: 6, magicDef: 18 },
      },
    },
    {
      id: 2203,
      type: ItemType.CHARACTER,
      name: "夏日佩可莉姆 (Summer Pecorine)",
      description: "夏日泳裝活動角色",
      rarity: 3,
      maxStack: 1,
      imageUrl: "https://example.com/characters/2203.png",
      meta: {
        isPrincess: true,
        alias: ["夏日佩可", "泳裝吃貨"],
        baseStats: { hp: 550, atk: 70, def: 11, magicDef: 10 },
      },
    },
  ];

  for (const char of characters) {
    await prisma.itemDefinition.upsert({
      where: { id: char.id },
      update: char,
      create: char,
    });
    console.log(`  ✅ Created: ${char.name} (${char.rarity}★)`);
  }

  console.log(`\n📦 Total characters created: ${characters.length}`);

  // ============================================================================
  // 2. Create Default Permanent Gacha Pool
  // ============================================================================

  console.log("\n🎰 Creating permanent gacha pool...");

  const permanentPool = await prisma.gachaPool.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "常駐角色池 (Permanent Pool)",
      type: PoolType.PERMANENT,
      isActive: true,
      priority: 100,
      startTime: new Date("2025-01-01T00:00:00Z"),
      endTime: null,
      config: {
        cost: 150, // Single draw: 150 jewel
        ceil: 200, // Ceiling: 200 points
        exchangeItems: [2201, 2202, 2203], // Can exchange any 3★ character
        conversionRate: { "1": 1, "2": 10, "3": 50 }, // Duplicate → stone conversion
        pointExpiry: { enabled: true, rate: 1 }, // 1 Pt = 1 stone when pool expires
      },
    },
  });

  console.log(`  ✅ Pool created: ${permanentPool.name}`);

  // ============================================================================
  // 3. Add Characters to Pool with Correct Weights
  // ============================================================================

  console.log("\n⚖️  Assigning character weights to pool...");

  // Weight distribution (total = 10000):
  // - 3★ total: 2.5% (250)  → Each 3★: 250/3 ≈ 83 weight
  // - 2★ total: 18.0% (1800) → Each 2★: 1800/7 ≈ 257 weight
  // - 1★ total: 79.5% (7950) → Each 1★: 7950/5 = 1590 weight

  const poolItems = [
    // 1★ Characters (7950 total weight, 5 characters)
    { poolId: 1, itemId: 2001, weight: 1590, isPickup: false },
    { poolId: 1, itemId: 2002, weight: 1590, isPickup: false },
    { poolId: 1, itemId: 2003, weight: 1590, isPickup: false },
    { poolId: 1, itemId: 2004, weight: 1590, isPickup: false },
    { poolId: 1, itemId: 2005, weight: 1590, isPickup: false },

    // 2★ Characters (1800 total weight, 7 characters)
    { poolId: 1, itemId: 2101, weight: 257, isPickup: false },
    { poolId: 1, itemId: 2102, weight: 257, isPickup: false },
    { poolId: 1, itemId: 2103, weight: 257, isPickup: false },
    { poolId: 1, itemId: 2104, weight: 257, isPickup: false },
    { poolId: 1, itemId: 2105, weight: 257, isPickup: false },
    { poolId: 1, itemId: 2106, weight: 257, isPickup: false },
    { poolId: 1, itemId: 2107, weight: 258, isPickup: false }, // +1 to reach exactly 1800

    // 3★ Characters (250 total weight, 3 characters)
    { poolId: 1, itemId: 2201, weight: 83, isPickup: false },
    { poolId: 1, itemId: 2202, weight: 83, isPickup: false },
    { poolId: 1, itemId: 2203, weight: 84, isPickup: false }, // +1 to reach exactly 250
  ];

  // Verify total weight = 10000
  const totalWeight = poolItems.reduce((sum, item) => sum + item.weight, 0);
  console.log(`  📊 Total weight: ${totalWeight} (expected: 10000)`);

  if (totalWeight !== 10000) {
    throw new Error(`Weight mismatch! Expected 10000, got ${totalWeight}`);
  }

  for (const item of poolItems) {
    await prisma.gachaPoolItem.upsert({
      where: {
        poolId_itemId: { poolId: item.poolId, itemId: item.itemId },
      },
      update: item,
      create: item,
    });
  }

  console.log(`  ✅ Pool items assigned: ${poolItems.length} characters`);

  // Display weight distribution summary
  const oneStarTotal = poolItems
    .filter((i) => i.itemId >= 2001 && i.itemId < 2100)
    .reduce((sum, i) => sum + i.weight, 0);
  const twoStarTotal = poolItems
    .filter((i) => i.itemId >= 2101 && i.itemId < 2200)
    .reduce((sum, i) => sum + i.weight, 0);
  const threeStarTotal = poolItems
    .filter((i) => i.itemId >= 2201 && i.itemId < 2300)
    .reduce((sum, i) => sum + i.weight, 0);

  console.log("\n  📈 Weight Distribution:");
  console.log(
    `     1★: ${oneStarTotal}/10000 (${(oneStarTotal / 100).toFixed(1)}%)`
  );
  console.log(
    `     2★: ${twoStarTotal}/10000 (${(twoStarTotal / 100).toFixed(1)}%)`
  );
  console.log(
    `     3★: ${threeStarTotal}/10000 (${(threeStarTotal / 100).toFixed(1)}%)`
  );

  // ============================================================================
  // 4. Create Admin Test User
  // ============================================================================

  console.log("\n👤 Creating admin test user...");

  const adminUser = await prisma.lineUser.upsert({
    where: { userId: "U_ADMIN_TEST" },
    update: {},
    create: {
      userId: "U_ADMIN_TEST",
      displayName: "Admin Test User",
      pictureUrl: "https://example.com/admin_avatar.png",
      statusMessage: "System Administrator",
      language: "zh-TW",
    },
  });

  console.log(`  ✅ User created: ${adminUser.displayName}`);

  const existingPermission = await prisma.userPermission.findFirst({
    where: {
      userId: "U_ADMIN_TEST",
      groupId: null,
    },
  });

  if (!existingPermission) {
    await prisma.userPermission.create({
      data: {
        userId: "U_ADMIN_TEST",
        groupId: null,
        role: Role.BOT_ADMIN,
      },
    });
  }

  console.log(`  ✅ Permission assigned: BOT_ADMIN`);

  // Create wallet with initial 10,000 jewel for testing
  await prisma.userWallet.upsert({
    where: { userId: "U_ADMIN_TEST" },
    update: {},
    create: {
      userId: "U_ADMIN_TEST",
      jewel: 10000,
      stone: 500,
      mana: BigInt(1000000),
      coins: {
        arena: 1000,
        clan: 500,
      },
    },
  });

  console.log(`  ✅ Wallet initialized: 10,000 jewel, 500 stone, 1M mana`);

  // ============================================================================
  // Summary
  // ============================================================================

  console.log("\n✨ Seed completed successfully!");
  console.log("\n📊 Summary:");
  console.log(`   - Characters: ${characters.length}`);
  console.log(`   - Gacha pools: 1 (Permanent)`);
  console.log(`   - Pool items: ${poolItems.length}`);
  console.log(`   - Admin users: 1 (U_ADMIN_TEST)`);
  console.log("\n🎮 You can now:");
  console.log("   1. Use admin commands to distribute jewels");
  console.log("   2. Test gacha draws with proper weight distribution");
  console.log("   3. Verify duplicate conversion and ceiling mechanics");
  console.log("\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
