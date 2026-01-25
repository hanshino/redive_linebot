# Gacha & Inventory System - Implementation Summary

## 📦 Deliverables

### 1. Database Schema

**File**: `apps/backend/prisma/schema.prisma`

**Added Models** (7 new):

- `UserWallet` - Currency management (jewel, stone, mana, coins)
- `GachaDailyLimit` - Daily draw tracking
- `ItemDefinition` - Static item catalog
- `InventoryItem` - User item instances
- `GachaPool` - Pool configuration
- `GachaPoolItem` - Pool items with weights
- `GachaExchange` - Ceiling points tracking

**Added Enums** (2 new):

- `ItemType`: CHARACTER, CONSUMABLE, EQUIPMENT, CURRENCY
- `PoolType`: PERMANENT, PICKUP, FES, LIMITED

**Status**: ✅ Validated with `npx prisma validate`

---

### 2. Migration Script

**File**: `apps/backend/prisma/migrations/add_gacha_inventory_system.sql`

Manual migration SQL script that creates:

- 2 ENUMs (ItemType, PoolType)
- 7 new tables with proper indexes and foreign keys
- Cascade delete rules for user-related data

**Status**: ✅ Ready to apply

---

### 3. Seed Script

**File**: `apps/backend/prisma/seed.ts`

Comprehensive seed script that populates:

**Characters** (15 total):

- 5x 1★ characters (79.5% drop rate)
- 7x 2★ characters (18.0% drop rate)
- 3x 3★ characters (2.5% drop rate)

**Gacha Pool**:

- 1 permanent pool with correct weight distribution
- Total weight = 10,000 (integer-based to avoid float errors)
- Configured with economy parameters:
  - Cost: 150 jewel per draw
  - Ceiling: 200 points
  - Duplicate conversion: 1★→1, 2★→10, 3★→50 stones
  - Point expiry: 1 Pt = 1 stone

**Test Data**:

- Admin user (userId: "U_ADMIN_TEST")
- BOT_ADMIN permission
- Initial wallet: 10,000 jewel, 500 stone, 1M mana

**Status**: ✅ TypeScript validated, ready to run

---

### 4. Admin Command Specification

**File**: `docs/specs/ADMIN_COMMANDS.md`

Complete specification for admin commands:

**Commands**:

1. `#admin give @user jewel <amount>` - Give jewel to specific user
2. `#admin give @all jewel <amount>` - Give jewel to all group members

**Includes**:

- Full syntax and examples
- Permission requirements (BOT_ADMIN/SUPER_ADMIN)
- Error handling cases
- Complete implementation code with TypeScript
- Unit test examples
- Security considerations

**Status**: ✅ Ready for implementation

---

### 5. Documentation Updates

**File**: `docs/specs/GACHA_INVENTORY_FINAL_SPEC.md` (Section 5)

Updated with all confirmed design decisions:

- Duplicate conversion rates
- Ceiling expiry policy
- Ten-pull mechanics
- Dry run behavior
- Item ID ranges
- Initial jewel distribution
- Pool scope (phase 1)
- Ceiling exchange options

**Status**: ✅ Updated

---

## 🔄 How to Use These Deliverables

### Step 1: Apply Database Migration

```bash
# Option A: Use db:push (development)
cd apps/backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/redive_dev?schema=public" \
  pnpm exec prisma db push

# Option B: Apply manual migration (production)
psql -U postgres -d redive_dev -f prisma/migrations/add_gacha_inventory_system.sql
```

### Step 2: Generate Prisma Client

```bash
pnpm db:generate
```

### Step 3: Run Seed Script

```bash
cd apps/backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/redive_dev?schema=public" \
  pnpm exec ts-node prisma/seed.ts
```

**Note**: If `ts-node` is not installed, add it:

```bash
pnpm add -D ts-node @types/node
```

Alternatively, configure `package.json` to run seed via Prisma:

```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

Then run:

```bash
pnpm exec prisma db seed
```

### Step 4: Verify Database

```bash
# Open Prisma Studio
pnpm db:studio

# Or query directly
psql -U postgres -d redive_dev -c "SELECT * FROM item_definitions;"
psql -U postgres -d redive_dev -c "SELECT * FROM gacha_pools;"
```

You should see:

- 15 characters in `item_definitions`
- 1 pool in `gacha_pools`
- 15 pool items in `gacha_pool_items`
- 1 admin user in `line_users`
- 1 admin permission in `user_permissions`
- 1 wallet in `user_wallets`

### Step 5: Implement Admin Commands

Follow the implementation guide in `docs/specs/ADMIN_COMMANDS.md`:

1. Create `apps/backend/src/line/commands/admin.commands.ts`
2. Implement the service using the provided code template
3. Register in `LineModule`
4. Write tests using the provided test template
5. Test with admin user: `#admin give @user jewel 1500`

---

## 📊 Database Schema Visualization

```
LineUser (existing)
├── UserWallet (1:1)
├── GachaDailyLimit (1:1)
├── InventoryItem (1:N)
└── GachaExchange (1:N)

ItemDefinition (catalog)
├── InventoryItem (1:N)
└── GachaPoolItem (1:N)

GachaPool (pools)
├── GachaPoolItem (1:N)
└── GachaExchange (1:N)
```

---

## 🎯 Key Design Decisions Recap

| Aspect                   | Decision           | Rationale                                          |
| ------------------------ | ------------------ | -------------------------------------------------- |
| **Duplicate Conversion** | 1★→1, 2★→10, 3★→50 | Conservative economy, encourages ceiling usage     |
| **Ceiling Expiry**       | 1 Pt = 1 stone     | Generous compensation for low duplicate conversion |
| **Ten-Pull Cost**        | 1500 jewel         | No discount, 10 Pt, guarantees ≥2★                 |
| **Initial Jewel**        | 0                  | Admin-controlled distribution only                 |
| **Pool Scope**           | Permanent only     | Phase 1 simplicity                                 |
| **Ceiling Exchange**     | Any 3★ (200 Pt)    | Maximum flexibility for players                    |
| **Item ID Ranges**       | 2000-4999 (chars)  | Clear categorization, room for growth              |

---

## ✅ Verification Checklist

Before proceeding to implementation:

- [ ] Database migration applied successfully
- [ ] Prisma Client generated
- [ ] Seed script executed without errors
- [ ] Prisma Studio shows all test data correctly
- [ ] Admin user exists with BOT_ADMIN permission
- [ ] 15 characters visible in item_definitions table
- [ ] Permanent pool has total weight = 10000
- [ ] Weight distribution matches spec (79.5% / 18.0% / 2.5%)
- [ ] All foreign keys and indexes created correctly

---

## 🚀 Next Steps (Implementation Phase)

### Phase 1: Core Services

1. **WalletService** - Currency management (jewel, stone, mana)
2. **InventoryService** - Item CRUD operations
3. **GachaService** - Draw logic, weight-based RNG, duplicate handling

### Phase 2: Gacha Commands

1. `#gacha single` - Single draw (150 jewel)
2. `#gacha ten` - Ten-pull (1500 jewel)
3. `#gacha ceiling` - View ceiling progress
4. `#gacha exchange` - Exchange ceiling points for 3★

### Phase 3: Inventory Commands

1. `#bag` or `#inventory` - View user inventory
2. `#bag characters` - Filter by character type
3. `#bag detail <itemId>` - View character details

### Phase 4: Admin Commands

1. Implement `#admin give @user jewel <amount>`
2. Implement `#admin give @all jewel <amount>`
3. Add audit logging
4. Write integration tests

### Phase 5: Additional Features

1. Daily limit enforcement
2. Dry run simulation when limit exhausted
3. Ceiling point expiry on pool end
4. Event logging for analytics

---

## 📝 Notes

### Database Migration Strategy

This implementation uses **manual migration** instead of Prisma Migrate because:

1. Database was not available during development
2. Manual SQL provides explicit control over schema changes
3. Allows reviewing exact DDL before applying

For production deployments, consider converting to proper Prisma migrations:

```bash
pnpm exec prisma migrate dev --name add_gacha_inventory_system
```

### Seed Script Flexibility

The seed script is idempotent and uses `upsert` operations, so it can be run multiple times safely. This is useful for:

- Resetting test data during development
- Recovering from accidental data deletion
- Seeding new environments (staging, production)

### Admin Command Integration

The admin command specification follows the existing command pattern found in the codebase:

- Uses `@Command` decorator
- Integrates with `CommandDiscoveryService`
- Follows permission checking patterns
- Uses NestJS dependency injection

---

**Version**: 1.0  
**Date**: 2025-01-25  
**Status**: ✅ Phase 1 Complete - Ready for Implementation
