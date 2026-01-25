# Quick Start Guide - Gacha & Inventory System

## 🚀 1-Minute Setup

### Prerequisites

- Docker running (PostgreSQL + Redis)
- Node.js 24 LTS
- pnpm 9.x

### Setup Commands

```bash
# 1. Ensure .env file has proper DATABASE_URL (no variable expansion)
# The .env file should have:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/redive_dev?schema=public"

# 2. Apply schema to database
cd apps/backend
pnpm exec prisma db push

# 3. Generate Prisma Client
cd ../..
pnpm db:generate

# 4. (Optional) Install ts-node for running seed script
cd apps/backend
pnpm add -D ts-node @types/node

# 5. Run seed script
pnpm exec ts-node prisma/seed.ts

# 6. Verify in Prisma Studio
cd ../..
pnpm db:studio
```

**Note**: Prisma Studio will open at `http://localhost:5555` (or a different port if 5555 is in use)

### Verification

Check that you see:

- ✅ 15 characters in `item_definitions` table
- ✅ 1 pool in `gacha_pools` table
- ✅ 15 items in `gacha_pool_items` table
- ✅ 1 admin user (U_ADMIN_TEST) in `line_users` table
- ✅ 1 wallet with 10,000 jewel in `user_wallets` table

---

## 📁 What Was Created

| File                                                            | Purpose                                    |
| --------------------------------------------------------------- | ------------------------------------------ |
| `apps/backend/prisma/schema.prisma`                             | Updated with 7 new models + 2 enums        |
| `apps/backend/prisma/migrations/add_gacha_inventory_system.sql` | Manual migration SQL                       |
| `apps/backend/prisma/seed.ts`                                   | Seed script with 15 characters + test data |
| `apps/backend/package.json`                                     | Added prisma.seed configuration            |
| `docs/specs/ADMIN_COMMANDS.md`                                  | Admin command specification                |
| `docs/specs/IMPLEMENTATION_SUMMARY.md`                          | Complete implementation guide              |
| `docs/specs/GACHA_INVENTORY_FINAL_SPEC.md`                      | Updated Section 5 with decisions           |

---

## 📊 Test Data Summary

### Characters (15 total)

**1★ Characters (5)** - 79.5% drop rate

- 2001: 佩可莉姆 (Pecorine)
- 2002: 凱留 (Karyl)
- 2003: 可可蘿 (Kokkoro)
- 2004: 優衣 (Yui)
- 2005: 怜 (Rei)

**2★ Characters (7)** - 18.0% drop rate

- 2101: 真步 (Mahiru)
- 2102: 璃乃 (Rino)
- 2103: 香織 (Kaori)
- 2104: 雪 (Miyuki)
- 2105: 茜里 (Akari)
- 2106: 美咲 (Misaki)
- 2107: 純 (Jun)

**3★ Characters (3)** - 2.5% drop rate

- 2201: 新春凱留 (New Year Karyl) ⭐ Princess
- 2202: 萬聖節美咲 (Halloween Misaki) ⭐ Princess
- 2203: 夏日佩可莉姆 (Summer Pecorine) ⭐ Princess

### Gacha Pool Configuration

- **Name**: 常駐角色池 (Permanent Pool)
- **Type**: PERMANENT
- **Cost**: 150 jewel per draw
- **Ceiling**: 200 points
- **Duplicate Conversion**: 1★→1, 2★→10, 3★→50 stones
- **Point Expiry**: 1 Pt = 1 Divine Stone
- **Total Weight**: 10,000 (exact)

### Admin Test User

- **User ID**: U_ADMIN_TEST
- **Display Name**: Admin Test User
- **Permission**: BOT_ADMIN
- **Initial Wallet**:
  - Jewel: 10,000
  - Stone: 500
  - Mana: 1,000,000

---

## 🎯 Quick Reference: Economy Balance

| Resource         | Purpose                    | Acquisition                          |
| ---------------- | -------------------------- | ------------------------------------ |
| **Jewel**        | Gacha currency             | Admin distribution, events           |
| **Divine Stone** | Ceiling exchange, upgrades | Duplicate characters, ceiling expiry |
| **Mana**         | Character enhancement      | Future feature                       |
| **Coins**        | Various systems            | Future feature                       |

### Gacha Rates

| Rarity | Base Rate | Per Character    |
| ------ | --------- | ---------------- |
| 3★     | 2.5%      | ~0.83% (3 chars) |
| 2★     | 18.0%     | ~2.57% (7 chars) |
| 1★     | 79.5%     | 15.9% (5 chars)  |

### Duplicate Conversion (Conservative)

| Rarity | Conversion | Rationale                      |
| ------ | ---------- | ------------------------------ |
| 1★     | 1 stone    | Low value, frequent duplicates |
| 2★     | 10 stones  | Medium value                   |
| 3★     | 50 stones  | High value, rare duplicates    |

**Why conservative?** Encourages ceiling usage (200 Pt for guaranteed 3★) over hoarding duplicates.

### Ceiling System

- **Accumulation**: 1 Pt per draw (permanent)
- **Cost**: 200 Pts for any 3★ character
- **Expiry**: When pool ends → 1 Pt = 1 Divine Stone (generous compensation)

---

## 🔧 Common Issues & Solutions

### Issue: "Cannot find module 'ts-node'"

**Solution**:

```bash
cd apps/backend
pnpm add -D ts-node @types/node
```

### Issue: "Invalid database URL"

**Solution**: Ensure you provide the full DATABASE_URL inline:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/redive_dev?schema=public" \
  pnpm exec prisma db push
```

### Issue: Seed script fails with Prisma Client error

**Solution**: Make sure you ran `pnpm db:generate` after `db:push`:

```bash
pnpm db:generate
```

### Issue: Docker not running

**Solution**:

```bash
pnpm docker:up
```

---

## 📖 Next Steps

1. **Read Full Spec**: `docs/specs/IMPLEMENTATION_SUMMARY.md`
2. **Implement Admin Commands**: `docs/specs/ADMIN_COMMANDS.md`
3. **Build Core Services**: WalletService, InventoryService, GachaService
4. **Add Gacha Commands**: `#gacha single`, `#gacha ten`, `#gacha ceiling`
5. **Add Inventory Commands**: `#bag`, `#bag characters`

---

## 📞 Support

For questions or issues:

1. Check `IMPLEMENTATION_SUMMARY.md` for detailed explanations
2. Review `ADMIN_COMMANDS.md` for command implementation examples
3. Inspect `GACHA_INVENTORY_FINAL_SPEC.md` for design decisions

---

**Version**: 1.0  
**Last Updated**: 2025-01-25  
**Status**: ✅ Ready to Use
