# Gacha & Inventory System - Work Handoff Document

**Date**: 2025-01-26  
**Author**: Sisyphus (AI Agent)  
**Status**: Phase 1 Complete - Foundation Ready  
**Commit**: `bc3de63` - feat(gacha): add complete gacha & inventory system foundation

---

## 📋 What Was Completed

### Phase 1: Database Foundation ✅

#### Database Schema

- **Location**: `apps/backend/prisma/schema.prisma`
- **Added**: 7 new models, 2 new enums
- **Status**: Schema applied to database, Prisma Client generated

**New Models**:

1. `UserWallet` - Currency management (jewel, stone, mana, coins)
2. `GachaDailyLimit` - Daily draw limit tracking
3. `ItemDefinition` - Static item catalog (characters, consumables)
4. `InventoryItem` - User item instances
5. `GachaPool` - Gacha pool configuration
6. `GachaPoolItem` - Pool items with weights
7. `GachaExchange` - Ceiling (spark) points tracking

**New Enums**:

- `ItemType`: CHARACTER, CONSUMABLE, EQUIPMENT, CURRENCY
- `PoolType`: PERMANENT, PICKUP, FES, LIMITED

#### Migration & Seed Scripts

- **Migration**: `apps/backend/prisma/migrations/add_gacha_inventory_system.sql`
  - Manual SQL migration (ready for production)
  - Includes all tables, indexes, foreign keys, cascade deletes
- **Seed**: `apps/backend/prisma/seed.ts`
  - 15 test characters (5x 1★, 7x 2★, 3x 3★)
  - 1 permanent gacha pool with correct weight distribution
  - 1 admin test user (U_ADMIN_TEST) with 10,000 jewel
  - Idempotent design (safe to re-run)

- **Verification**: `apps/backend/prisma/verify.ts`
  - Script to verify seed data correctness

#### Configuration Updates

- **Fixed**: `.env` file - replaced variable expansion with literal values
- **Added**: `prisma.seed` configuration in `package.json`
- **Updated**: `.gitignore` to exclude compiled Prisma scripts

---

## 📚 Documentation Created

All documentation is in `docs/specs/`:

| File                            | Purpose                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `QUICK_START.md`                | 1-minute setup guide (start here!)                        |
| `IMPLEMENTATION_SUMMARY.md`     | Complete implementation guide with verification checklist |
| `GACHA_INVENTORY_FINAL_SPEC.md` | Full system specification with design decisions           |
| `ADMIN_COMMANDS.md`             | Admin command specification with code examples            |
| `DECISION_CHECKLIST.md`         | Design decision record                                    |
| `RECOMMENDED_CONFIG.md`         | Economy balance recommendations                           |
| `README.md`                     | Documentation index                                       |

---

## 🚀 How to Continue (Next Developer)

### Immediate Setup (5 minutes)

```bash
# 1. Ensure Docker is running
pnpm docker:up

# 2. Check database connection (Prisma Studio should open)
pnpm db:studio

# 3. If database is empty, run seed script:
cd apps/backend
pnpm add -D ts-node @types/node
pnpm exec ts-node prisma/seed.ts

# 4. Verify in Prisma Studio (check for 15 characters, 1 pool)
```

### Verification Checklist

After running seed, verify in Prisma Studio:

- [ ] `item_definitions` table has 15 characters
- [ ] `gacha_pools` table has 1 permanent pool
- [ ] `gacha_pool_items` table has 15 items (total weight = 10,000)
- [ ] `line_users` table has admin user (U_ADMIN_TEST)
- [ ] `user_wallets` table has wallet with 10,000 jewel

---

## 📋 What's Next (Implementation Phases)

### Phase 2: Core Services (Priority: HIGH)

**Create these services in `apps/backend/src/`:**

1. **WalletService** (`src/wallet/wallet.service.ts`)
   - `getWallet(userId: string)` - Get user wallet
   - `addJewel(userId: string, amount: number)` - Add jewel
   - `deductJewel(userId: string, amount: number)` - Deduct jewel
   - `addStone(userId: string, amount: number)` - Add divine stone
   - `convertCurrency(...)` - Convert between currencies

2. **InventoryService** (`src/inventory/inventory.service.ts`)
   - `getInventory(userId: string)` - Get user inventory
   - `addItem(userId: string, itemDefId: number)` - Add item to inventory
   - `removeItem(userId: string, itemId: string)` - Remove item
   - `getCharacters(userId: string)` - Get all characters
   - `upgradeCharacter(...)` - Character upgrade logic

3. **GachaService** (`src/gacha/gacha.service.ts`)
   - `performDraw(userId: string, poolId: number, count: number)` - Execute gacha draw
   - `calculateResults(...)` - Weight-based RNG
   - `handleDuplicates(...)` - Convert duplicates to stones
   - `updateCeilingPoints(...)` - Update ceiling progress
   - `exchangeCeiling(userId: string, poolId: number, itemId: number)` - Exchange ceiling points

**Reference**: See `IMPLEMENTATION_SUMMARY.md` for detailed service structure

---

### Phase 3: Gacha Commands (Priority: HIGH)

**Implement these LINE Bot commands in `apps/backend/src/line/commands/`:**

1. `#gacha single` - Single draw (150 jewel)
2. `#gacha ten` - Ten-pull (1500 jewel, guarantee ≥2★)
3. `#gacha ceiling` - View ceiling progress
4. `#gacha exchange <character_name>` - Exchange 200 ceiling points for 3★

**Pattern**: Follow existing `@Command` decorator pattern (see `ADMIN_COMMANDS.md`)

---

### Phase 4: Inventory Commands (Priority: MEDIUM)

1. `#bag` or `#inventory` - View user inventory
2. `#bag characters` - Filter by character type
3. `#bag detail <itemId>` - View character details with stats

---

### Phase 5: Admin Commands (Priority: MEDIUM)

**Reference**: `docs/specs/ADMIN_COMMANDS.md` has complete implementation code

1. `#admin give @user jewel <amount>` - Give jewel to specific user
2. `#admin give @all jewel <amount>` - Give jewel to all group members

**Security**: Requires `BOT_ADMIN` or `SUPER_ADMIN` role

---

### Phase 6: Additional Features (Priority: LOW)

- Daily limit enforcement (use `GachaDailyLimit` model)
- Dry run simulation when limit exhausted
- Ceiling point expiry on pool end
- Event logging for analytics
- Character upgrade system (use `stone` currency)

---

## 🎯 Economy Design (Confirmed)

### Gacha Rates

| Rarity | Rate  | Weight     | Characters                                            |
| ------ | ----- | ---------- | ----------------------------------------------------- |
| 3★     | 2.5%  | 250/10000  | 3 (New Year Karyl, Halloween Misaki, Summer Pecorine) |
| 2★     | 18.0% | 1800/10000 | 7 (Mahiru, Rino, Kaori, Miyuki, Akari, Misaki, Jun)   |
| 1★     | 79.5% | 7950/10000 | 5 (Pecorine, Karyl, Kokkoro, Yui, Rei)                |

### Currency Values

| Action                  | Cost/Reward                  |
| ----------------------- | ---------------------------- |
| Single draw             | 150 jewel                    |
| Ten-pull                | 1500 jewel (no discount)     |
| Ten-pull ceiling points | +10 points                   |
| Ceiling exchange        | 200 points = 1x 3★ character |
| Duplicate 1★ → Stone    | 1 stone                      |
| Duplicate 2★ → Stone    | 10 stones                    |
| Duplicate 3★ → Stone    | 50 stones                    |
| Ceiling expiry          | 1 point = 1 stone            |

### Design Rationale

**Conservative duplicate conversion** (1/10/50 stones):

- Encourages using ceiling system (200 Pt >> 200 stones)
- Makes ceiling points more valuable
- Prevents stone hoarding

**Generous ceiling expiry** (1 Pt = 1 stone):

- Compensates for low duplicate conversion
- Player-friendly when pool expires
- Still balanced due to low duplicate rates

---

## 🔧 Known Issues & Notes

### Issue: Prisma dotenv not loading

**Symptom**: Running scripts with `node` directly fails with "DATABASE_URL invalid"

**Cause**: `apps/backend/prisma.config.ts` uses `dotenv/config`, but dotenv isn't installed

**Solution**: Always use environment variable prefix:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/redive_dev?schema=public" \
  node script.js
```

Or install ts-node and run TypeScript directly:

```bash
pnpm exec ts-node prisma/seed.ts
```

### Important: `.env` File

The `.env` file has been updated to use literal values instead of variable expansion:

```bash
# Old (doesn't work with Prisma)
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@..."

# New (works)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/redive_dev?schema=public"
```

---

## 📁 Project Structure

```
apps/backend/
├── prisma/
│   ├── schema.prisma                    # ✅ Updated with 7 models + 2 enums
│   ├── migrations/
│   │   └── add_gacha_inventory_system.sql  # ✅ Manual migration
│   ├── seed.ts                          # ✅ Seed script with 15 characters
│   └── verify.ts                        # ✅ Verification script
└── src/
    ├── wallet/                          # 🔜 TODO: Create WalletService
    ├── inventory/                       # 🔜 TODO: Create InventoryService
    ├── gacha/                           # 🔜 TODO: Create GachaService
    └── line/
        └── commands/                    # 🔜 TODO: Create gacha/admin commands

docs/specs/
├── QUICK_START.md                       # ✅ 1-minute setup guide
├── IMPLEMENTATION_SUMMARY.md            # ✅ Complete guide
├── GACHA_INVENTORY_FINAL_SPEC.md        # ✅ Full specification
└── ADMIN_COMMANDS.md                    # ✅ Admin command spec with code
```

---

## 📞 Questions & Support

### Where to Find Information

| Question                         | Document                                                  |
| -------------------------------- | --------------------------------------------------------- |
| How to set up?                   | `QUICK_START.md`                                          |
| What to implement next?          | `IMPLEMENTATION_SUMMARY.md`                               |
| Why this design decision?        | `GACHA_INVENTORY_FINAL_SPEC.md` Section 5                 |
| How to implement admin commands? | `ADMIN_COMMANDS.md`                                       |
| Database schema details?         | `apps/backend/prisma/schema.prisma` (with JSDoc comments) |

### Testing the Setup

```bash
# Test 1: Database connection
pnpm db:studio
# Should open at http://localhost:5555 (or similar port)

# Test 2: Verify seed data
cd apps/backend
pnpm exec ts-node prisma/verify.ts
# Should show:
#   ✅ Characters: 15/15
#   ✅ Gacha Pools: 1/1
#   ✅ Pool Items: 15/15
#   ✅ Admin User: Found

# Test 3: Check weight distribution
# In Prisma Studio, sum weights in gacha_pool_items table
# Should equal exactly 10,000
```

---

## ✅ Handoff Checklist

Before continuing work, ensure:

- [ ] Docker PostgreSQL and Redis are running
- [ ] Prisma Studio can connect (`pnpm db:studio`)
- [ ] Seed script has been run successfully
- [ ] Database has 15 characters and 1 pool
- [ ] You've read `QUICK_START.md`
- [ ] You've reviewed `IMPLEMENTATION_SUMMARY.md`
- [ ] You understand the economy design (gacha rates, currency values)

---

## 🎉 Summary

**Phase 1 Status**: ✅ **COMPLETE**

All foundation work is done:

- Database schema designed and applied
- Migration script ready for production
- Comprehensive seed data for testing
- Complete documentation with code examples
- Economy design finalized and documented

**Ready for Phase 2**: Core Services Implementation

**Estimated Effort**:

- Phase 2 (Core Services): ~8-12 hours
- Phase 3 (Gacha Commands): ~6-8 hours
- Phase 4 (Inventory Commands): ~4-6 hours
- Phase 5 (Admin Commands): ~4-6 hours

**Total**: ~22-32 hours for full system implementation

---

**Last Updated**: 2025-01-26 00:30 JST  
**Next Developer**: Start with `docs/specs/QUICK_START.md` 🚀
