// CharacterFragmentService — 真實 MySQL 的整合測試。
//
// 為什麼是真的 DB 而不是 mock：這支 service 的正確性幾乎全部長在鎖與隔離等級上
// （FOR UPDATE 是 record lock 還是 gap lock、RC 有沒有下 gap lock、扣減有沒有原子性）。
// 全域 setup 的 mock builder 把 `transaction(cb)` 化簡成「直接呼叫 cb」，
// 完全不會排隊、也不可能死鎖 —— 用它寫「並發兌換 6 隻不同角色不死鎖」只會得到
// 一個永遠綠燈、卻對 Lane B 修掉的那個 bug 毫無感覺的測試。
//
// CI 影響評估：`.github/workflows/main.yml` 只做 docker build + push，完全沒有跑
// jest 的 job，所以這支不會讓 CI 掛掉。本機沒開 `make infra` 時會連不上 MySQL，
// 因此用 `describe.skip` gate 掉（見下方 describeIfDb），行為與既有的
// WorldBoss 整合測試一致 —— 那幾支同樣要求本機有 MySQL。
//
// 資料隔離：跟 WorldBoss 一樣建一個用完就丟的資料庫，跑完整套 migration，
// 絕不碰開發用的 Princess。
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });

const crypto = require("crypto");
const path = require("path");
const knex = require("knex");

const dbConfig = require("../../../knexfile");

const DATABASE_NAME = `Princess_fragtest_${process.pid}_${Date.now().toString(36)}_${crypto
  .randomBytes(4)
  .toString("hex")}`;

const adminConfig = {
  ...dbConfig,
  connection: { ...dbConfig.connection, user: "root", password: process.env.DB_PASSWORD },
};
delete adminConfig.connection.database;

const mysql = knex({
  ...dbConfig,
  // 併發測試需要每個交易各自一條連線，池子太小會假性序列化而測不出死鎖。
  pool: { min: 0, max: 20 },
  connection: { ...dbConfig.connection, database: DATABASE_NAME },
});

jest.mock("../../util/mysql", () => mysql);

const FragmentModel = require("../../model/princess/CharacterFragment");
const { inventory: InventoryModel } = require("../../model/application/Inventory");
const CharacterFragmentService = require("../CharacterFragmentService");

const REDEEM_COST = CharacterFragmentService.REDEEM_COST;

// 沒有可用的 MySQL 就整組跳過，而不是讓整個測試檔爆掉。
const canReachDatabase = Boolean(
  process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD
);
const describeIfDb = canReachDatabase ? describe : describe.skip;

const USER = "Ufrag_" + "a".repeat(26);
const OTHER = "Ufrag_" + "b".repeat(26);

// 原生星數刻意各異，用來證明兌換一律給 1★ 而不是繼承原生星數。
const CHARACTERS = [
  { ID: 9001, Name: "碎片測試-彩", Star: "3" },
  { ID: 9002, Name: "碎片測試-銀", Star: "1" },
  { ID: 9003, Name: "碎片測試-金", Star: "2" },
  { ID: 9004, Name: "碎片測試-金2", Star: "2" },
  { ID: 9005, Name: "碎片測試-金3", Star: "2" },
  { ID: 9006, Name: "碎片測試-金4", Star: "2" },
];

async function setBalance(userId, itemId, amount) {
  await mysql("character_fragments")
    .insert({ user_id: userId, item_id: itemId, amount })
    .onConflict(["user_id", "item_id"])
    .merge({ amount });
}

async function balanceOf(userId, itemId) {
  const row = await mysql("character_fragments")
    .where({ user_id: userId, item_id: itemId })
    .first();
  return row ? Number(row.amount) : null;
}

async function godStoneOf(userId) {
  const row = await mysql("inventory")
    .where({ userId, itemId: 999 })
    .sum({ amount: "itemAmount" })
    .first();
  return Number((row && row.amount) || 0);
}

async function ownedRows(userId, itemId) {
  return mysql("inventory").where({ userId, itemId }).select("*");
}

/**
 * 讓所有參與者到齊才一起放行 —— 否則「並發」會退化成依序執行，
 * 測試照樣綠燈但完全沒測到競態。
 */
function barrier(count) {
  let resolveGate;
  const gate = new Promise(resolve => {
    resolveGate = resolve;
  });
  let arrived = 0;
  return () => {
    arrived += 1;
    if (arrived >= count) resolveGate();
    return gate;
  };
}

function isDeadlock(error) {
  return Boolean(error && (error.code === "ER_LOCK_DEADLOCK" || error.errno === 1213));
}

describeIfDb("CharacterFragmentService（真實 MySQL）", () => {
  beforeAll(async () => {
    const admin = knex(adminConfig);
    try {
      await admin.raw(
        `CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
      );
      await admin.raw(`GRANT ALL PRIVILEGES ON \`${DATABASE_NAME}\`.* TO ??@'%'`, [
        process.env.DB_USER,
      ]);
    } finally {
      await admin.destroy();
    }

    // 保險栓：連錯資料庫的話後面的 del() 會清到真的開發資料。
    const [rows] = await mysql.raw("SELECT DATABASE() AS db");
    if (rows[0].db !== DATABASE_NAME) {
      throw new Error(`Unsafe fragment test database: ${rows[0].db}`);
    }

    await mysql.migrate.latest({ directory: path.resolve(__dirname, "../../../migrations") });
    await mysql("gacha_pool").insert(
      CHARACTERS.map(c => ({ ...c, HeadImage_Url: `https://example.test/${c.ID}.png`, Rate: "1%" }))
    );
  }, 120000);

  afterAll(async () => {
    await mysql.destroy();
    const admin = knex(adminConfig);
    try {
      await admin.raw(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``);
    } finally {
      await admin.destroy();
    }
  }, 60000);

  beforeEach(async () => {
    await mysql("character_fragments").del();
    await mysql("inventory").del();
  });

  // -------------------------------------------------------------------------
  // 併發（最高優先）。這一段是 Lane B 實測結果的迴歸網：任何一個 case 轉紅，
  // 代表鎖序或隔離等級被改回會死鎖／會超發的版本。
  // -------------------------------------------------------------------------
  describe("併發", () => {
    it("同角色並發 redeem ×4：恰 1 筆成功、inventory 恰 1 列、碎片只扣 150", async () => {
      const itemId = 9001;
      await setBalance(USER, itemId, REDEEM_COST * 4);

      const gate = barrier(4);
      const results = await Promise.all(
        Array.from({ length: 4 }, async () => {
          await gate();
          return CharacterFragmentService.redeem(USER, itemId);
        })
      );

      expect(results.filter(r => r.ok)).toHaveLength(1);
      // 失敗的那三筆必須是「已持有」，不能是死鎖爆出來的例外
      expect(results.filter(r => !r.ok).map(r => r.code)).toEqual([
        "ALREADY_OWNED",
        "ALREADY_OWNED",
        "ALREADY_OWNED",
      ]);
      expect(await ownedRows(USER, itemId)).toHaveLength(1);
      // 只扣一次 150：扣兩次就是碎片被吃掉卻沒拿到第二隻角色
      expect(await balanceOf(USER, itemId)).toBe(REDEEM_COST * 3);
    });

    it("同使用者不同角色並發 redeem ×6：0 死鎖、6 隻全部到手", async () => {
      // Lane B 修掉的就是這個形狀：先鎖 inventory 空區間會拿 gap lock，
      // RR 下 5/6 ER_LOCK_DEADLOCK。改成先鎖碎片列 + RC 之後降到 0/6。
      const itemIds = CHARACTERS.map(c => c.ID);
      for (const itemId of itemIds) {
        await setBalance(USER, itemId, REDEEM_COST);
      }

      const gate = barrier(itemIds.length);
      const settled = await Promise.allSettled(
        itemIds.map(async itemId => {
          await gate();
          return CharacterFragmentService.redeem(USER, itemId);
        })
      );

      const deadlocks = settled.filter(s => s.status === "rejected" && isDeadlock(s.reason));
      expect(deadlocks).toHaveLength(0);
      expect(settled.filter(s => s.status === "fulfilled" && s.value.ok)).toHaveLength(6);

      for (const itemId of itemIds) {
        expect(await ownedRows(USER, itemId)).toHaveLength(1);
        expect(await balanceOf(USER, itemId)).toBe(0);
      }
    });

    it("並發 recycle ×12：0 死鎖、女神石總額精確", async () => {
      const itemId = 9001;
      const rounds = 12;
      const perRound = 5;
      await setBalance(USER, itemId, rounds * perRound);

      const gate = barrier(rounds);
      const settled = await Promise.allSettled(
        Array.from({ length: rounds }, async () => {
          await gate();
          return CharacterFragmentService.recycle(USER, itemId, perRound);
        })
      );

      const deadlocks = settled.filter(s => s.status === "rejected" && isDeadlock(s.reason));
      expect(deadlocks).toHaveLength(0);
      expect(settled.filter(s => s.status === "fulfilled" && s.value.ok)).toHaveLength(rounds);

      // 1 片 = 1 女神石，一片都不能多也不能少
      expect(await balanceOf(USER, itemId)).toBe(0);
      expect(await godStoneOf(USER)).toBe(rounds * perRound);
    });

    it("redeem vs 外部授予同角色：回 ALREADY_OWNED 且碎片未扣", async () => {
      const itemId = 9003;
      await setBalance(USER, itemId, REDEEM_COST);

      // 抽卡／市場在同一瞬間把角色塞進來的形狀
      await InventoryModel.create({
        userId: USER,
        itemId,
        itemAmount: 1,
        attributes: JSON.stringify([{ key: "star", value: 2 }]),
        note: "external_grant",
      });

      const res = await CharacterFragmentService.redeem(USER, itemId);

      expect(res).toEqual({ ok: false, code: "ALREADY_OWNED" });
      // 已持有時碎片一片都不能動
      expect(await balanceOf(USER, itemId)).toBe(REDEEM_COST);
      expect(await ownedRows(USER, itemId)).toHaveLength(1);
    });

    it("recycle + redeem 混合並發：消耗碎片 = 女神石 + 150 × 角色數（守恆）", async () => {
      const itemId = 9001;
      const startBalance = REDEEM_COST * 3;
      await setBalance(USER, itemId, startBalance);

      const recycleQty = 7;
      const recycleCount = 6;
      const redeemCount = 4;

      const gate = barrier(recycleCount + redeemCount);
      const settled = await Promise.allSettled([
        ...Array.from({ length: recycleCount }, async () => {
          await gate();
          return CharacterFragmentService.recycle(USER, itemId, recycleQty);
        }),
        ...Array.from({ length: redeemCount }, async () => {
          await gate();
          return CharacterFragmentService.redeem(USER, itemId);
        }),
      ]);

      expect(settled.filter(s => s.status === "rejected" && isDeadlock(s.reason))).toHaveLength(0);

      const remaining = await balanceOf(USER, itemId);
      const godStone = await godStoneOf(USER);
      const characterCount = (await ownedRows(USER, itemId)).length;

      // 碎片只有兩個出口：回收成女神石、或兌換成角色。帳必須合得起來。
      expect(startBalance - remaining).toBe(godStone + REDEEM_COST * characterCount);
      // 一人一隻：混合併發也不能兌出第二隻
      expect(characterCount).toBeLessThanOrEqual(1);
    });

    it("並發 increase ×20：upsert 加總正確，且只有一列", async () => {
      const itemId = 9002;
      const times = 20;

      const gate = barrier(times);
      await Promise.all(
        Array.from({ length: times }, async (_, i) => {
          await gate();
          return FragmentModel.increase(USER, itemId, i + 1);
        })
      );

      // 1..20 的和 = 210。UNIQUE(user_id, item_id) + 原子 upsert 保證不掉更新。
      expect(await balanceOf(USER, itemId)).toBe(210);
      const rows = await mysql("character_fragments").where({ user_id: USER, item_id: itemId });
      expect(rows).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 業務規則
  // -------------------------------------------------------------------------
  describe("已持有者仍可累積與回收（市場供給的來源）", () => {
    it("owned=true、canRedeem=false，但回收成功、兌換回 ALREADY_OWNED", async () => {
      const itemId = 9001;
      await setBalance(USER, itemId, REDEEM_COST + 50);
      await InventoryModel.create({
        userId: USER,
        itemId,
        itemAmount: 1,
        attributes: JSON.stringify([{ key: "star", value: 3 }]),
        note: "already_owned",
      });

      const { fragments } = {
        fragments: await CharacterFragmentService.getInventory(USER),
      };
      const entry = fragments.find(f => f.itemId === itemId);
      expect(entry).toMatchObject({ owned: true, canRedeem: false, amount: REDEEM_COST + 50 });

      // 回收照樣可以 —— 這正是老玩家把不需要的碎片變現的路徑
      const recycled = await CharacterFragmentService.recycle(USER, itemId, 50);
      expect(recycled).toMatchObject({ ok: true, godStoneGained: 50 });
      expect(await godStoneOf(USER)).toBe(50);

      // 但不能兌換
      expect(await CharacterFragmentService.redeem(USER, itemId)).toEqual({
        ok: false,
        code: "ALREADY_OWNED",
      });
      expect(await balanceOf(USER, itemId)).toBe(REDEEM_COST);
    });

    it("已持有且碎片 < 150 回 ALREADY_OWNED，不是 INSUFFICIENT_FRAGMENTS", async () => {
      const itemId = 9001;
      await setBalance(USER, itemId, 10);
      await InventoryModel.create({
        userId: USER,
        itemId,
        itemAmount: 1,
        attributes: JSON.stringify([{ key: "star", value: 3 }]),
        note: "already_owned",
      });

      // 「碎片不足」會讓已經有這隻角色的人以為再湊 150 片就能換
      expect(await CharacterFragmentService.redeem(USER, itemId)).toEqual({
        ok: false,
        code: "ALREADY_OWNED",
      });
    });
  });

  describe("兌換一律 1★", () => {
    it.each([
      [9001, "3★ 原生"],
      [9002, "1★ 原生"],
    ])("itemId=%i（%s）兌換後 attributes 是 star:1", async itemId => {
      await setBalance(USER, itemId, REDEEM_COST);

      const res = await CharacterFragmentService.redeem(USER, itemId);

      expect(res).toMatchObject({ ok: true, star: 1, cost: REDEEM_COST });
      const [row] = await ownedRows(USER, itemId);
      const attributes =
        typeof row.attributes === "string" ? JSON.parse(row.attributes) : row.attributes;
      // 原生 3★ 也只給 1★：碎片兌換不繼承原生星數
      expect(attributes).toEqual([{ key: "star", value: 1 }]);
    });
  });

  describe("餘額列生命週期", () => {
    it("歸零後列仍存在，且可以再 increase 回來", async () => {
      const itemId = 9002;
      await setBalance(USER, itemId, 5);

      await CharacterFragmentService.recycle(USER, itemId, 5);

      // 歸零不刪列 —— 後續扣減才鎖得到一筆確定存在的紀錄（而不是 gap）
      expect(await balanceOf(USER, itemId)).toBe(0);

      await FragmentModel.increase(USER, itemId, 3);
      expect(await balanceOf(USER, itemId)).toBe(3);
    });

    it("getInventory 只回 amount > 0 的列", async () => {
      await setBalance(USER, 9001, 0);
      await setBalance(USER, 9002, 7);

      const fragments = await CharacterFragmentService.getInventory(USER);

      expect(fragments.map(f => f.itemId)).toEqual([9002]);
    });

    it("無碎片列時 recycle / redeem 回不足，且不建立幽靈列", async () => {
      expect(await CharacterFragmentService.recycle(USER, 9001, 1)).toMatchObject({
        ok: false,
        code: "INSUFFICIENT_FRAGMENTS",
        balance: 0,
      });
      expect(await CharacterFragmentService.redeem(USER, 9001)).toMatchObject({
        ok: false,
        code: "INSUFFICIENT_FRAGMENTS",
        balance: 0,
      });

      // 失敗路徑不能留下 amount=0 的空列，否則清單與統計都會被汙染
      expect(await balanceOf(USER, 9001)).toBeNull();
      expect(await godStoneOf(USER)).toBe(0);
    });
  });

  describe("驗證與邊界", () => {
    it.each([
      [0, "零"],
      [-5, "負數"],
      [1.5, "小數"],
      [undefined, "缺值"],
      ["10", "字串"],
      [1e20, "超出安全整數"],
      [NaN, "NaN"],
    ])("recycle quantity=%p（%s）回 INVALID_QUANTITY 且不動任何資料", async quantity => {
      await setBalance(USER, 9001, 500);

      expect(await CharacterFragmentService.recycle(USER, 9001, quantity)).toEqual({
        ok: false,
        code: "INVALID_QUANTITY",
      });
      // 負數特別致命：會變成「回收」出碎片又拿到負女神石
      expect(await balanceOf(USER, 9001)).toBe(500);
      expect(await godStoneOf(USER)).toBe(0);
    });

    it.each([
      [999, "女神石本身"],
      [0, "零"],
      [-1, "負數"],
      ["abc", "非數字"],
      [null, "null"],
      [1.5, "小數"],
    ])("itemId=%p（%s）回 INVALID_ITEM", async itemId => {
      expect(await CharacterFragmentService.recycle(USER, itemId, 1)).toEqual({
        ok: false,
        code: "INVALID_ITEM",
      });
      expect(await CharacterFragmentService.redeem(USER, itemId)).toEqual({
        ok: false,
        code: "INVALID_ITEM",
      });
    });

    it("itemId=999 即使有碎片列也擋掉（否則 redeem(999) 會憑空印女神石）", async () => {
      await setBalance(USER, 999, REDEEM_COST);

      expect(await CharacterFragmentService.redeem(USER, 999)).toEqual({
        ok: false,
        code: "INVALID_ITEM",
      });
      expect(await godStoneOf(USER)).toBe(0);
      expect(await ownedRows(USER, 999)).toHaveLength(0);
    });

    it("不存在的角色回 ITEM_NOT_FOUND（碎片夠也不能兌換）", async () => {
      await setBalance(USER, 8888, REDEEM_COST);

      expect(await CharacterFragmentService.redeem(USER, 8888)).toEqual({
        ok: false,
        code: "ITEM_NOT_FOUND",
      });
      expect(await balanceOf(USER, 8888)).toBe(REDEEM_COST);
    });

    it("碎片剛好 150 可以兌換（邊界不能少一片）", async () => {
      await setBalance(USER, 9001, REDEEM_COST);

      const res = await CharacterFragmentService.redeem(USER, 9001);

      expect(res.ok).toBe(true);
      expect(await balanceOf(USER, 9001)).toBe(0);
    });

    it("碎片 149 回 INSUFFICIENT_FRAGMENTS 並附差額", async () => {
      await setBalance(USER, 9001, REDEEM_COST - 1);

      expect(await CharacterFragmentService.redeem(USER, 9001)).toEqual({
        ok: false,
        code: "INSUFFICIENT_FRAGMENTS",
        balance: REDEEM_COST - 1,
        required: REDEEM_COST,
        shortfall: 1,
      });
      expect(await balanceOf(USER, 9001)).toBe(REDEEM_COST - 1);
    });

    it("回收數量大於餘額時回不足，不會扣成負數", async () => {
      await setBalance(USER, 9001, 3);

      expect(await CharacterFragmentService.recycle(USER, 9001, 4)).toEqual({
        ok: false,
        code: "INSUFFICIENT_FRAGMENTS",
        balance: 3,
        required: 4,
        shortfall: 1,
      });
      expect(await balanceOf(USER, 9001)).toBe(3);
      expect(await godStoneOf(USER)).toBe(0);
    });

    it("回收全部餘額可以（邊界相等）", async () => {
      await setBalance(USER, 9001, 3);

      expect(await CharacterFragmentService.recycle(USER, 9001, 3)).toMatchObject({
        ok: true,
        fragmentBalanceAfter: 0,
        godStoneGained: 3,
      });
      expect(await godStoneOf(USER)).toBe(3);
    });
  });

  describe("回應與清單形狀", () => {
    it("getInventory 的每一列只有白名單欄位，且帶原生星數供顯示", async () => {
      await setBalance(USER, 9001, 20);

      const [entry] = await CharacterFragmentService.getInventory(USER);

      expect(Object.keys(entry).sort()).toEqual(
        ["amount", "baseStar", "canRedeem", "headImage", "itemId", "name", "owned"].sort()
      );
      // baseStar 是原生星數（只供顯示），與兌換給的 1★ 無關
      expect(entry).toMatchObject({ itemId: 9001, baseStar: 3, amount: 20, owned: false });
      expect(entry.canRedeem).toBe(false);
    });

    it("清單依 amount 由多至少排序，同 amount 以 itemId 排序", async () => {
      await setBalance(USER, 9003, 50);
      await setBalance(USER, 9001, 50);
      await setBalance(USER, 9002, 99);

      const fragments = await CharacterFragmentService.getInventory(USER);

      expect(fragments.map(f => [f.itemId, f.amount])).toEqual([
        [9002, 99],
        [9001, 50],
        [9003, 50],
      ]);
    });

    it("碎片達 150 且未持有時 canRedeem=true", async () => {
      await setBalance(USER, 9001, REDEEM_COST);

      const [entry] = await CharacterFragmentService.getInventory(USER);

      expect(entry).toMatchObject({ canRedeem: true, owned: false });
    });

    it("recycle 成功回應不含女神石餘額（刻意不讀，避免 gap lock）", async () => {
      await setBalance(USER, 9001, 10);

      const res = await CharacterFragmentService.recycle(USER, 9001, 4);

      expect(Object.keys(res).sort()).toEqual(
        ["fragmentBalanceAfter", "godStoneGained", "itemId", "ok", "quantity"].sort()
      );
      expect(res).not.toHaveProperty("balance");
    });

    it("redeem 成功回應帶角色名稱與頭像，星數固定 1", async () => {
      await setBalance(USER, 9001, REDEEM_COST);

      const res = await CharacterFragmentService.redeem(USER, 9001);

      expect(res).toMatchObject({
        ok: true,
        itemId: 9001,
        name: "碎片測試-彩",
        star: 1,
        cost: REDEEM_COST,
        fragmentBalanceAfter: 0,
      });
    });

    it("別人的碎片不會出現在我的清單裡", async () => {
      await setBalance(OTHER, 9001, 500);
      await setBalance(USER, 9002, 7);

      const fragments = await CharacterFragmentService.getInventory(USER);

      expect(fragments.map(f => f.itemId)).toEqual([9002]);
    });

    it("別人持有同一角色不影響我的 owned 判定", async () => {
      await setBalance(USER, 9001, REDEEM_COST);
      await InventoryModel.create({
        userId: OTHER,
        itemId: 9001,
        itemAmount: 1,
        attributes: JSON.stringify([{ key: "star", value: 3 }]),
        note: "other_owns",
      });

      const [entry] = await CharacterFragmentService.getInventory(USER);

      expect(entry).toMatchObject({ owned: false, canRedeem: true });
      expect((await CharacterFragmentService.redeem(USER, 9001)).ok).toBe(true);
    });
  });
});
