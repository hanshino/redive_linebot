# Gacha & Inventory System - Final Specification

## 文件資訊

- **版本**: 1.0 (Final Draft)
- **最後更新**: 2026-01-25
- **狀態**: 待最終確認

---

## 目錄

1. [系統概述](#1-系統概述)
2. [架構設計](#2-架構設計)
3. [資料庫 Schema](#3-資料庫-schema)
4. [核心功能規格](#4-核心功能規格)
5. [待確認事項](#5-待確認事項)
6. [遷移計畫](#6-遷移計畫)
7. [API 設計建議](#7-api-設計建議)

---

## 1. 系統概述

### 1.1 設計目標

本系統旨在重構 Redive LineBot 的轉蛋與背包系統，解決舊版系統的以下問題：

- ❌ 貨幣與物品混在同一張表 (`itemId: 999`)
- ❌ 無法擁有多個相同物品且屬性獨立
- ❌ 缺乏多卡池支援
- ❌ 擴充性不足 (新增道具類型困難)

### 1.2 核心特性

- ✅ **分層架構**: 錢包 (Wallet) / 背包 (Inventory) / 轉蛋 (Gacha) 職責分離
- ✅ **物品實例化**: 每個物品有獨立 ID，支援個別屬性
- ✅ **多卡池支援**: 後台可配置，支援 PickUp / Fes / 限定池
- ✅ **天井機制**: 累積點數兌換角色
- ✅ **每日限制**: 一天真實抽卡一次，其餘為模擬 (Dry Run)
- ✅ **ACID 保證**: 使用 PostgreSQL Transaction 確保交易安全

---

## 2. 架構設計

### 2.1 三層架構

```
┌─────────────────────────────────────────────────┐
│                  Gacha Layer                    │
│  ┌──────────────┐      ┌──────────────────┐    │
│  │  GachaPool   │◄─────┤ GachaPoolItem    │    │
│  └──────────────┘      └──────────────────┘    │
│         │                        │              │
└─────────┼────────────────────────┼──────────────┘
          │                        │
          ▼                        ▼
┌─────────────────────────────────────────────────┐
│                  Item Layer                     │
│  ┌──────────────┐      ┌──────────────────┐    │
│  │ItemDefinition│◄─────┤ InventoryItem    │    │
│  └──────────────┘      └──────────────────┘    │
│         │                        │              │
└─────────┼────────────────────────┼──────────────┘
          │                        │
          ▼                        ▼
┌─────────────────────────────────────────────────┐
│                 Wallet Layer                    │
│  ┌──────────────┐      ┌──────────────────┐    │
│  │  UserWallet  │      │ GachaDailyLimit  │    │
│  └──────────────┘      └──────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 2.2 設計理念

| 層級       | 職責                              | 優點                   |
| ---------- | --------------------------------- | ---------------------- |
| **Wallet** | 管理貨幣數值 (寶石、女神石、瑪那) | 查詢極快，邏輯清晰     |
| **Item**   | 定義物品靜態屬性 + 實例動態屬性   | 支援物品升級、養成     |
| **Gacha**  | 配置卡池、機率、天井規則          | 彈性配置，不寫死程式碼 |

---

## 3. 資料庫 Schema

### 3.1 錢包層 (Wallet Layer)

#### UserWallet - 用戶錢包

```prisma
model UserWallet {
  userId    String   @id @map("user_id")
  jewel     Int      @default(0)      // 寶石 (抽卡消耗)
  stone     Int      @default(0)      // 女神石 (重複補償/商店)
  mana      BigInt   @default(0)      // 瑪那/金幣 (強化用)
  coins     Json?                     // 其他代幣 { "arena": 500, "clan": 1000 }

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user      LineUser @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@map("user_wallets")
}
```

**設計考量**:

- `jewel/stone/mana` 獨立欄位，高頻查詢優化
- `coins` 使用 JSONB，低頻貨幣彈性擴充
- `mana` 使用 BigInt，避免後期溢位

#### GachaDailyLimit - 每日抽卡限制

```prisma
model GachaDailyLimit {
  userId       String   @id @map("user_id")
  lastDrawAt   DateTime @map("last_draw_at")   // 最後真實抽卡時間
  drawCount    Int      @default(0)             // 今日已抽次數
  maxDraws     Int      @default(1)             // 每日上限 (VIP 可增加)

  updatedAt    DateTime @updatedAt @map("updated_at")

  user         LineUser @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@map("gacha_daily_limits")
}
```

**業務邏輯**:

- 每天台灣時間 00:00 重置 `drawCount = 0`
- 真實抽卡前檢查: `drawCount < maxDraws`
- Dry Run 不受限制，無限次模擬

---

### 3.2 物品層 (Item Layer)

#### ItemType - 物品類型枚舉

```prisma
enum ItemType {
  CHARACTER   // 角色 (maxStack=1, 不可堆疊)
  CONSUMABLE  // 消耗品 (maxStack>1, 可堆疊)
  EQUIPMENT   // 裝備 (預留，未來擴充)
  CURRENCY    // 代幣 (預留，特殊處理)
}
```

#### ItemDefinition - 物品定義 (靜態圖鑑)

```prisma
model ItemDefinition {
  id          Int      @id @default(autoincrement())
  type        ItemType
  name        String                              // 物品名稱
  description String?                             // 物品描述
  rarity      Int      @default(1)                // 稀有度 (1~3星)
  maxStack    Int      @default(1)                // 最大堆疊數 (1=獨立實例)
  imageUrl    String?  @map("image_url")          // 圖片連結

  // 靜態屬性 (Metadata)
  // CHARACTER: { "isPrincess": true, "alias": ["新黑"], "baseStats": {...} }
  // CONSUMABLE: { "effect": "restore_stamina", "value": 100 }
  meta        Json?

  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  // Relations
  instances   InventoryItem[]
  poolItems   GachaPoolItem[]

  @@map("item_definitions")
}
```

**設計考量**:

- `rarity` 整數型態，方便機率計算
- `maxStack` 區分堆疊/獨立實例
- `meta` JSONB 存放非結構化屬性

#### InventoryItem - 背包物品 (動態實例)

```prisma
model InventoryItem {
  id         String   @id @default(cuid())        // 唯一實例 ID
  userId     String   @map("user_id")
  itemDefId  Int      @map("item_def_id")

  amount     Int      @default(1)                 // 堆疊數量 (消耗品用)

  // 動態屬性 (Instance Properties)
  // CHARACTER: { "level": 100, "rank": 15, "bond": 8, "star": 3 }
  // CONSUMABLE: 不使用此欄位
  properties Json?

  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  definition ItemDefinition @relation(fields: [itemDefId], references: [id])
  user       LineUser       @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@index([userId])
  @@index([itemDefId])
  @@index([userId, itemDefId])                   // 查詢用戶是否擁有某物品
  @@map("inventory_items")
}
```

**業務邏輯**:

- **CHARACTER 類型**: 每個角色一筆 Row，`amount=1`，屬性存 `properties`
- **CONSUMABLE 類型**: 同類型消耗品共用一筆 Row，數量累加到 `amount`
- **重複角色檢查**: 抽卡前查詢 `SELECT COUNT(*) WHERE userId=? AND itemDefId=? AND definition.type='CHARACTER'`

---

### 3.3 轉蛋層 (Gacha Layer)

#### PoolType - 卡池類型枚舉

```prisma
enum PoolType {
  PERMANENT   // 常駐池
  PICKUP      // 加倍池 (PickUp)
  FES         // 祭典池 (3星機率翻倍)
  LIMITED     // 限定池
}
```

#### GachaPool - 卡池定義

```prisma
model GachaPool {
  id          Int       @id @default(autoincrement())
  name        String                                  // 卡池名稱 (e.g. "新年黑貓 PickUp")
  type        PoolType  @default(PICKUP)
  isActive    Boolean   @default(true) @map("is_active")
  priority    Int       @default(0)                   // 顯示順序 (數字越大越優先)

  startTime   DateTime? @map("start_time")            // 開池時間
  endTime     DateTime? @map("end_time")              // 關池時間

  // 卡池設定
  // {
  //   "cost": 150,                    // 單抽消耗寶石
  //   "ceil": 200,                    // 天井點數
  //   "exchangeItems": [2001, 2002],  // 可兌換角色 ID 列表
  //   "rateBoost": { "3": 2.0 }       // Fes 池機率加成
  // }
  config      Json?

  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  items       GachaPoolItem[]
  exchanges   GachaExchange[]

  @@map("gacha_pools")
}
```

#### GachaPoolItem - 卡池物品 (機率配置)

```prisma
model GachaPoolItem {
  poolId      Int       @map("pool_id")
  itemId      Int       @map("item_id")

  weight      Int                                     // 權重 (整數，避免浮點誤差)
  isPickup    Boolean   @default(false) @map("is_pickup")

  // 特殊標記 (e.g. 限定角色、保底角色)
  meta        Json?

  pool        GachaPool      @relation(fields: [poolId], references: [id], onDelete: Cascade)
  item        ItemDefinition @relation(fields: [itemId], references: [id])

  @@id([poolId, itemId])
  @@map("gacha_pool_items")
}
```

**權重範例**:

- 3星總機率 2.5% → 總權重 250
- 2星總機率 18.0% → 總權重 1800
- 1星總機率 79.5% → 總權重 7950
- **總池權重** = 10000

#### GachaExchange - 天井點數紀錄

```prisma
model GachaExchange {
  userId      String    @map("user_id")
  poolId      Int       @map("pool_id")

  points      Int       @default(0)                   // 累積天井點數
  totalDraws  Int       @default(0)                   // 該池總抽卡次數 (統計用)

  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  user        LineUser  @relation(fields: [userId], references: [userId], onDelete: Cascade)
  pool        GachaPool @relation(fields: [poolId], references: [id], onDelete: Cascade)

  @@id([userId, poolId])
  @@map("gacha_exchanges")
}
```

**天井規則**:

- 每抽一次獲得 **1 Pt**
- 累積達到 `GachaPool.config.ceil` (預設 200) 可兌換角色
- 卡池結束時點數 **轉換為女神石** (例: 10 Pt = 1 女神石)

---

## 4. 核心功能規格

### 4.1 每日限制機制 (Daily Limit)

#### 流程圖

```
用戶執行 #抽
    │
    ├─→ 查詢 GachaDailyLimit
    │
    ├─→ 檢查: lastDrawAt 是否為今天?
    │     ├─ YES → 檢查 drawCount < maxDraws?
    │     │         ├─ YES → 真實抽卡 (扣款 + 發獎)
    │     │         └─ NO  → Dry Run (模擬抽卡)
    │     └─ NO  → 重置 drawCount=0, 真實抽卡
    │
    └─→ 更新 lastDrawAt, drawCount++
```

#### 實作邏輯 (Pseudocode)

```typescript
async function drawGacha(userId: string, poolId: number): Promise<DrawResult> {
  const limit = await getDailyLimit(userId);
  const now = new Date();
  const todayStart = startOfDay(now, { timeZone: "Asia/Taipei" });

  // 檢查是否為今日首抽
  const isNewDay = !limit || limit.lastDrawAt < todayStart;
  const canDrawReal = isNewDay || limit.drawCount < limit.maxDraws;

  if (canDrawReal) {
    // 真實抽卡 (Transaction)
    const result = await prisma.$transaction(async (tx) => {
      // 1. 扣款
      await deductJewel(tx, userId, cost);

      // 2. 抽獎 (權重計算)
      const reward = await calculateReward(poolId);

      // 3. 發放獎勵
      await grantReward(tx, userId, reward);

      // 4. 天井點數 +1
      await incrementExchangePoint(tx, userId, poolId);

      // 5. 更新每日限制
      await updateDailyLimit(tx, userId, now);

      return { ...reward, isDryRun: false };
    });

    return result;
  } else {
    // Dry Run (僅計算，不寫入)
    const reward = await calculateReward(poolId);
    return { ...reward, isDryRun: true };
  }
}
```

---

### 4.2 抽卡核心邏輯 (Gacha Core)

#### 權重抽選演算法

```typescript
interface PoolItem {
  itemId: number;
  weight: number;
  rarity: number;
}

function selectReward(poolItems: PoolItem[]): number {
  const totalWeight = poolItems.reduce((sum, item) => sum + item.weight, 0);
  const random = Math.floor(Math.random() * totalWeight);

  let accumulated = 0;
  for (const item of poolItems) {
    accumulated += item.weight;
    if (random < accumulated) {
      return item.itemId;
    }
  }

  // Fallback (shouldn't reach here)
  return poolItems[poolItems.length - 1].itemId;
}
```

#### 重複角色處理

```typescript
async function grantReward(
  tx: PrismaTransaction,
  userId: string,
  itemId: number
) {
  const item = await tx.itemDefinition.findUnique({ where: { id: itemId } });

  if (item.type === "CHARACTER") {
    // 檢查是否已擁有
    const existing = await tx.inventoryItem.findFirst({
      where: { userId, itemDefId: itemId },
    });

    if (existing) {
      // 重複 → 轉換為女神石
      const stoneAmount = getStoneConversionRate(item.rarity);
      await tx.userWallet.update({
        where: { userId },
        data: { stone: { increment: stoneAmount } },
      });

      return { type: "DUPLICATE", itemId, stoneAmount };
    } else {
      // 新角色 → 建立實例
      await tx.inventoryItem.create({
        data: {
          userId,
          itemDefId: itemId,
          amount: 1,
          properties: { star: item.rarity, level: 1, rank: 1, bond: 0 },
        },
      });

      return { type: "NEW", itemId };
    }
  } else if (item.type === "CONSUMABLE") {
    // 消耗品 → 堆疊
    await tx.inventoryItem.upsert({
      where: { userId_itemDefId: { userId, itemDefId: itemId } },
      update: { amount: { increment: 1 } },
      create: { userId, itemDefId: itemId, amount: 1 },
    });

    return { type: "CONSUMABLE", itemId };
  }
}
```

---

### 4.3 天井兌換機制 (Spark Exchange)

#### 兌換流程

```typescript
async function exchangeWithSpark(
  userId: string,
  poolId: number,
  targetItemId: number
): Promise<ExchangeResult> {
  return await prisma.$transaction(async (tx) => {
    // 1. 檢查點數
    const exchange = await tx.gachaExchange.findUnique({
      where: { userId_poolId: { userId, poolId } },
    });

    const pool = await tx.gachaPool.findUnique({ where: { id: poolId } });
    const requiredPoints = pool.config.ceil; // e.g. 200

    if (!exchange || exchange.points < requiredPoints) {
      throw new Error("點數不足");
    }

    // 2. 檢查目標物品是否可兌換
    const validItems = pool.config.exchangeItems; // [2001, 2002, ...]
    if (!validItems.includes(targetItemId)) {
      throw new Error("此角色不可兌換");
    }

    // 3. 扣除點數
    await tx.gachaExchange.update({
      where: { userId_poolId: { userId, poolId } },
      data: { points: { decrement: requiredPoints } },
    });

    // 4. 發放角色 (強制給予，不管是否重複)
    await tx.inventoryItem.create({
      data: {
        userId,
        itemDefId: targetItemId,
        amount: 1,
        properties: { star: 3, level: 1, rank: 1, bond: 0, obtained: "SPARK" },
      },
    });

    return { success: true, itemId: targetItemId };
  });
}
```

---

## 5. 已確認配置 (Confirmed Configuration)

**決策日期**: 2026-01-25  
**狀態**: ✅ 全部確認完成

### 🔴 核心參數 (Critical Parameters)

#### 5.1 重複角色轉換比例

抽到已擁有的角色時，轉換為女神石的數量:

```
[✓] 1星角色 → 1 女神石
[✓] 2星角色 → 10 女神石
[✓] 3星角色 → 50 女神石
```

**設計理念**: 保守經濟設計，女神石作為次級資源用於未來的角色強化/升星功能。天井點數 (Pt) 價值高於女神石，鼓勵玩家優先使用天井兌換角色。

---

#### 5.2 天井點數過期處理

卡池結束時，未使用的點數轉換規則:

```
[✓] 1 Pt = 1 女神石
```

**說明**: 比推薦值 (10:1) 更慷慨，但由於女神石轉換率較低，整體經濟仍保持平衡。玩家會優先兌換角色 (200 Pt = 1個3星) 而非等待轉換 (200 Pt = 200 女神石 = 4個重複3星的價值)。

---

#### 5.3 十連抽設計

```
[✓] 十連成本: 1500 寶石 (無折扣)
[✓] 十連保底: 保證至少 1 個 2星以上
[✓] 天井點數: 十連獲得 10 Pt (無額外獎勵)
```

**經濟平衡**: 無折扣避免單抽被淘汰，2星保底提升體驗但不影響整體機率分布。

---

#### 5.4 Dry Run 提示方式

當用戶今日已真實抽過，再次執行 `#抽` 時:

```
[✓] 方案 B: 顯示模擬結果 + 明確提示
```

**訊息範例**:

```
⚠️ 預覽模式 (未扣款)

🎉 本次獲得:
★★★ 新年黑貓
★★ 茜里
★ 佩可莉姆 (重複 +1 女神石)
...

💡 今日真實抽卡次數已用完
明日 00:00 (台灣時間) 重置
```

---

### 🟡 系統配置 (System Configuration)

#### 5.5 物品 ID 規劃

```
[✓] 採用區段劃分:
  1000~1999: 貨幣類 (Jewel, Divine Stone, Mana)
  2000~4999: 角色 (Characters)
    2000~2999: 一般角色
    3000~3999: 公主形態角色
  5000~5999: 消耗品 (Consumables)
  9000~9999: 系統物品 (System Items)
```

---

#### 5.6 初始寶石配置

```
[✓] 不贈送初始寶石
[✓] 透過管理員指令發放 (支援測試與活動)
```

**實作**: 提供 `#admin give @user jewel <amount>` 指令供管理員使用。

---

### 🟢 實作範圍 (Implementation Scope)

#### 5.7 卡池實作範圍

```
[✓] 第一階段: 僅常駐池 (Permanent Pool)
  - 包含所有已實裝角色
  - 標準機率 (3星 2.5%, 2星 18%, 1星 79.5%)
  - 支援天井兌換 (200 Pt 換任意 3星)
```

**未來擴充**: PickUp 池 (特定角色機率提升)、Fes 池 (3星機率翻倍至 5%)

---

#### 5.8 女神石用途

```
[✓] 第一階段: 僅作重複補償
```

**未來擴充**:

- 角色升星 (3星→4星→5星)
- 商店兌換 (角色碎片、裝備)
- 角色專武強化

**預留設計**: `InventoryItem.properties` 中已包含 `star` 欄位供升星功能使用。

---

## 6. 遷移計畫

### 6.1 遷移策略

採用 **逐步遷移 (Gradual Migration)** 避免服務中斷:

#### Phase 1: Schema 部署 (不影響舊系統)

```bash
# 1. 建立新表 (不刪除舊表)
pnpm db:push

# 2. 確認 Prisma Studio 可正常開啟
pnpm db:studio
```

#### Phase 2: 資料遷移 (雙寫模式)

```typescript
// 遷移腳本範例
async function migrateGachaData() {
  // 1. 遷移角色定義: GachaPool (舊) → ItemDefinition (新)
  const oldCharacters = await legacyDB.gachaPool.findMany();

  for (const char of oldCharacters) {
    await prisma.itemDefinition.create({
      data: {
        id: char.id,
        type: "CHARACTER",
        name: char.name,
        description: char.description,
        rarity: char.star,
        maxStack: 1,
        imageUrl: char.headImage_url,
        meta: {
          isPrincess: char.name.includes("公主") || char.name.includes("🔷"),
          alias: [], // 需手動補充
          legacy: true,
        },
      },
    });
  }

  // 2. 遷移用戶背包: Inventory (舊) → InventoryItem (新)
  const oldInventories = await legacyDB.inventory.findMany();

  for (const inv of oldInventories) {
    if (inv.itemId === 999) {
      // 女神石 → UserWallet
      await prisma.userWallet.upsert({
        where: { userId: inv.userId },
        update: { stone: inv.amount },
        create: { userId: inv.userId, stone: inv.amount, jewel: 0, mana: 0 },
      });
    } else {
      // 角色 → InventoryItem
      await prisma.inventoryItem.create({
        data: {
          userId: inv.userId,
          itemDefId: inv.itemId,
          amount: 1,
          properties: {
            star: inv.amount, // 舊系統用 amount 存星數 (需確認)
            level: 1,
            rank: 1,
            bond: 0,
            migratedFrom: "legacy",
          },
        },
      });
    }
  }

  console.log("遷移完成");
}
```

#### Phase 3: 切換讀寫 (New System Online)

```typescript
// 舊邏輯 (停用)
// await legacyInventoryService.addItem(...)

// 新邏輯 (啟用)
await newGachaService.drawGacha(userId, poolId);
```

#### Phase 4: 驗證與清理

```sql
-- 驗證資料一致性
SELECT
  old.userId,
  old.itemId,
  old.amount AS old_amount,
  COUNT(new.id) AS new_count
FROM legacy_inventory old
LEFT JOIN inventory_items new ON old.userId = new.user_id AND old.itemId = new.item_def_id
WHERE old.itemId != 999
GROUP BY old.userId, old.itemId, old.amount
HAVING old.amount != new_count;

-- 無誤差後，歸檔舊表
ALTER TABLE gacha_pool RENAME TO gacha_pool_legacy;
ALTER TABLE inventory RENAME TO inventory_legacy;
```

---

### 6.2 Rollback Plan

若遷移失敗，回滾步驟:

1. **停止新系統寫入** (切回舊 Service)
2. **檢查資料一致性**:
   ```sql
   -- 檢查是否有新系統寫入的資料
   SELECT COUNT(*) FROM inventory_items WHERE created_at > '2026-01-25 00:00:00';
   ```
3. **刪除新表** (若無法修復):
   ```bash
   # 備份後刪除
   pg_dump -t inventory_items > backup_inventory_items.sql
   DROP TABLE inventory_items;
   DROP TABLE item_definitions;
   # ... (其他新表)
   ```

---

## 7. API 設計建議

### 7.1 LINE Bot 指令

| 指令                 | 說明                 | 參數          |
| -------------------- | -------------------- | ------------- |
| `#抽`                | 從預設池抽一次       | 無            |
| `#抽 10`             | 從預設池抽十連       | 次數 (1/10)   |
| `#抽 新黑池 10`      | 從指定池抽卡         | 池別名 + 次數 |
| `#轉蛋列表`          | 顯示所有開放中的卡池 | 無            |
| `#我的背包`          | 顯示持有角色與物品   | 無            |
| `#我的錢包`          | 顯示寶石/女神石餘額  | 無            |
| `#天井進度`          | 顯示當前池的天井點數 | 無            |
| `#天井兌換 新年黑貓` | 使用天井點數兌換角色 | 角色名稱      |

---

### 7.2 REST API (未來前端使用)

#### GET /api/gacha/pools

取得所有開放的卡池

**Response**:

```json
{
  "pools": [
    {
      "id": 1,
      "name": "新年黑貓 PickUp",
      "type": "PICKUP",
      "isActive": true,
      "startTime": "2026-01-01T00:00:00Z",
      "endTime": "2026-01-31T23:59:59Z",
      "config": {
        "cost": 150,
        "ceil": 200,
        "exchangeItems": [2001]
      }
    }
  ]
}
```

---

#### POST /api/gacha/draw

執行抽卡

**Request**:

```json
{
  "poolId": 1,
  "count": 10
}
```

**Response**:

```json
{
  "success": true,
  "isDryRun": false,
  "results": [
    {
      "itemId": 2001,
      "type": "CHARACTER",
      "rarity": 3,
      "isNew": true,
      "isDuplicate": false
    },
    {
      "itemId": 3010,
      "type": "CHARACTER",
      "rarity": 1,
      "isNew": false,
      "isDuplicate": true,
      "stoneConverted": 10
    }
  ],
  "summary": {
    "cost": 1500,
    "remainingJewel": 8500,
    "exchangePoints": 10,
    "newCharacters": 1,
    "duplicates": 9
  }
}
```

---

#### GET /api/user/inventory

取得用戶背包

**Response**:

```json
{
  "characters": [
    {
      "id": "clxxx1234",
      "itemId": 2001,
      "name": "新年黑貓",
      "rarity": 3,
      "properties": {
        "star": 3,
        "level": 100,
        "rank": 15,
        "bond": 8
      }
    }
  ],
  "consumables": [
    {
      "itemId": 5001,
      "name": "體力藥水",
      "amount": 25
    }
  ]
}
```

---

#### GET /api/user/wallet

取得用戶錢包

**Response**:

```json
{
  "jewel": 10000,
  "stone": 250,
  "mana": 5000000,
  "coins": {
    "arena": 500,
    "clan": 1200
  }
}
```

---

## 附錄 A: 名詞對照表

| 中文     | 英文                 | 說明                            |
| -------- | -------------------- | ------------------------------- |
| 寶石     | Jewel                | 抽卡主要消耗貨幣                |
| 女神石   | Divine Stone / Stone | 重複角色補償                    |
| 瑪那     | Mana                 | 遊戲內金幣                      |
| 天井     | Spark / Ceiling      | 累積點數兌換機制                |
| 保底     | Pity                 | 累積抽數必出機制 (本系統未採用) |
| 模擬抽卡 | Dry Run              | 不扣款不發獎的預覽模式          |
| 卡池     | Gacha Pool           | 轉蛋機台                        |
| PickUp   | PickUp / Rate-Up     | 加倍池 (特定角色機率提升)       |
| Fes      | Festival             | 祭典池 (整體3星機率翻倍)        |

---

## 附錄 B: 參考資料

- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [公主連結 Gacha Mechanics (Wiki)](https://princess-connect.fandom.com)
- [PostgreSQL JSONB Indexing](https://www.postgresql.org/docs/current/datatype-json.html)

---

**下一步**: 請逐項確認 [待確認事項](#5-待確認事項)，完成後即可開始實作。
