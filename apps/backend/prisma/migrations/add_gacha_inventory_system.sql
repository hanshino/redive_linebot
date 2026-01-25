-- CreateEnum for ItemType
CREATE TYPE "ItemType" AS ENUM ('CHARACTER', 'CONSUMABLE', 'EQUIPMENT', 'CURRENCY');

-- CreateEnum for PoolType
CREATE TYPE "PoolType" AS ENUM ('PERMANENT', 'PICKUP', 'FES', 'LIMITED');

-- CreateTable: user_wallets
CREATE TABLE "user_wallets" (
    "user_id" TEXT NOT NULL,
    "jewel" INTEGER NOT NULL DEFAULT 0,
    "stone" INTEGER NOT NULL DEFAULT 0,
    "mana" BIGINT NOT NULL DEFAULT 0,
    "coins" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable: gacha_daily_limits
CREATE TABLE "gacha_daily_limits" (
    "user_id" TEXT NOT NULL,
    "last_draw_at" TIMESTAMP(3) NOT NULL,
    "draw_count" INTEGER NOT NULL DEFAULT 0,
    "max_draws" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gacha_daily_limits_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable: item_definitions
CREATE TABLE "item_definitions" (
    "id" SERIAL NOT NULL,
    "type" "ItemType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rarity" INTEGER NOT NULL DEFAULT 1,
    "max_stack" INTEGER NOT NULL DEFAULT 1,
    "image_url" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: inventory_items
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_def_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "properties" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: gacha_pools
CREATE TABLE "gacha_pools" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PoolType" NOT NULL DEFAULT 'PICKUP',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gacha_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable: gacha_pool_items
CREATE TABLE "gacha_pool_items" (
    "pool_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "is_pickup" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB,

    CONSTRAINT "gacha_pool_items_pkey" PRIMARY KEY ("pool_id","item_id")
);

-- CreateTable: gacha_exchanges
CREATE TABLE "gacha_exchanges" (
    "user_id" TEXT NOT NULL,
    "pool_id" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "total_draws" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gacha_exchanges_pkey" PRIMARY KEY ("user_id","pool_id")
);

-- CreateIndex
CREATE INDEX "inventory_items_user_id_idx" ON "inventory_items"("user_id");

-- CreateIndex
CREATE INDEX "inventory_items_item_def_id_idx" ON "inventory_items"("item_def_id");

-- CreateIndex
CREATE INDEX "inventory_items_user_id_item_def_id_idx" ON "inventory_items"("user_id", "item_def_id");

-- AddForeignKey
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "line_users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gacha_daily_limits" ADD CONSTRAINT "gacha_daily_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "line_users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_item_def_id_fkey" FOREIGN KEY ("item_def_id") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "line_users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gacha_pool_items" ADD CONSTRAINT "gacha_pool_items_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "gacha_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gacha_pool_items" ADD CONSTRAINT "gacha_pool_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gacha_exchanges" ADD CONSTRAINT "gacha_exchanges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "line_users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gacha_exchanges" ADD CONSTRAINT "gacha_exchanges_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "gacha_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
