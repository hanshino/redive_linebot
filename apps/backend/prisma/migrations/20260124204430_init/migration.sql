-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'GROUP_ADMIN', 'GROUP_OWNER', 'BOT_ADMIN', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "line_users" (
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "picture_url" TEXT,
    "status_message" TEXT,
    "language" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "group_id" TEXT,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_configs" (
    "group_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_configs_pkey" PRIMARY KEY ("group_id")
);

-- CreateIndex
CREATE INDEX "idx_last_seen" ON "line_users"("last_seen_at");

-- CreateIndex
CREATE INDEX "user_permissions_user_id_idx" ON "user_permissions"("user_id");

-- CreateIndex
CREATE INDEX "user_permissions_group_id_idx" ON "user_permissions"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_user_id_group_id_key" ON "user_permissions"("user_id", "group_id");

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "line_users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
