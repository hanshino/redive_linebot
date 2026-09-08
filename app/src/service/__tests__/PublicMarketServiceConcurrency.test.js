// PublicMarketService 的角色交易併發 — 真實 MySQL 整合測試。
//
// 為什麼是真的 DB 而不是 mock：這一段的正確性全部長在鎖與隔離等級上（FOR UPDATE
// 命中的是 record lock 還是空區間的 gap lock、RC 有沒有下 gap lock、insert intention
// 會不會互衝成環）。全域 setup 的 mock builder 把 `transaction(cb)` 化簡成「直接呼叫
// cb」，永遠不會排隊也不可能死鎖 —— 用它寫死鎖測試只會得到永遠綠燈、卻對本次修掉的
// bug 毫無感覺的測試。純邏輯與回應形狀的測試仍在 PublicMarketService.test.js。
//
// CI 影響評估：`.github/workflows/main.yml` 只做 docker build + push，沒有跑 jest 的
// job，所以這支不會讓 CI 掛掉。本機沒開 `make infra` 時連不上 MySQL，因此用
// `describe.skip` gate 掉（見 describeIfDb），與 CharacterFragmentService 那支一致。
//
// 資料隔離：建一個用完就丟的資料庫並跑完整套 migration，絕不碰開發用的 Princess。
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });

const crypto = require("crypto");
const path = require("path");
const knex = require("knex");

const dbConfig = require("../../../knexfile");

const DATABASE_NAME = `Princess_mkttest_${process.pid}_${Date.now().toString(36)}_${crypto
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
  pool: { min: 0, max: 30 },
  connection: { ...dbConfig.connection, database: DATABASE_NAME },
});

jest.mock("../../util/mysql", () => mysql);
jest.mock("../ProfileService", () => ({ resolveDisplayName: async id => id }));
jest.mock("../AchievementEngine", () => ({ evaluate: async () => [] }));

const Service = require("../PublicMarketService");
const CharacterFragmentService = require("../CharacterFragmentService");
const PublicMarketModel = require("../../model/application/PublicMarket");
const FragmentModel = require("../../model/princess/CharacterFragment");

const canReachDatabase = Boolean(
  process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD
);
const describeIfDb = canReachDatabase ? describe : describe.skip;

const ITEM_BASE = 9300;
const STAR = JSON.stringify([{ key: "star", value: 3 }]);
const REDEEM_COST = CharacterFragmentService.REDEEM_COST;

// userId 刻意連號 —— 相鄰的索引鍵才會落在同一個 gap，那正是死鎖的觸發條件。
const U = n => "U" + String(n).padStart(31, "0");

function isDeadlock(error) {
  return Boolean(error && (error.code === "ER_LOCK_DEADLOCK" || error.errno === 1213));
}

/**
 * 讓所有參與者到齊才一起放行 —— 否則「並發」會退化成依序執行，
 * 測試照樣綠燈但完全沒測到競態。
 */
function barrier(count) {
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  let arrived = 0;
  return () => {
    arrived += 1;
    if (arrived >= count) release();
    return gate;
  };
}

function summarize(settled) {
  return {
    deadlocks: settled.filter(s => s.status === "rejected" && isDeadlock(s.reason)).length,
    otherErrors: settled
      .filter(s => s.status === "rejected" && !isDeadlock(s.reason))
      .map(s => s.reason && s.reason.message),
    ok: settled.filter(s => s.status === "fulfilled" && s.value && s.value.ok).length,
    codes: settled
      .filter(s => s.status === "fulfilled" && s.value && !s.value.ok)
      .map(s => s.value.code),
  };
}

async function godStoneOf(userId) {
  const row = await mysql("inventory")
    .where({ userId, itemId: 999 })
    .sum({ amount: "itemAmount" })
    .first();
  return Number((row && row.amount) || 0);
}

async function ownedRows(userId, itemId) {
  return mysql("inventory").where({ userId, itemId }).select("id");
}

async function fragmentBalanceOf(userId, itemId) {
  const row = await mysql("character_fragments")
    .where({ user_id: userId, item_id: itemId })
    .first();
  return row ? Number(row.amount) : null;
}

async function giveCharacter(userId, itemId) {
  await mysql("inventory").insert({
    userId,
    itemId,
    itemAmount: 1,
    attributes: STAR,
    note: "test_seed",
  });
}

async function giveGodStone(userId, amount) {
  await mysql("inventory").insert({ userId, itemId: 999, itemAmount: amount, note: "test_seed" });
}

async function createSellListing(sellerId, itemId, price = 100) {
  return Number(
    await PublicMarketModel.create({
      order_type: "sell",
      seller_id: sellerId,
      item_id: itemId,
      item_kind: "character",
      quantity: 1,
      price,
      fee: Service.calcFee(price),
      status: "open",
    })
  );
}

describeIfDb("PublicMarketService 角色交易併發（真實 MySQL）", () => {
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
      throw new Error(`Unsafe market test database: ${rows[0].db}`);
    }

    await mysql.migrate.latest({ directory: path.resolve(__dirname, "../../../migrations") });
    await mysql("gacha_pool").insert(
      Array.from({ length: 120 }, (_, i) => ({
        ID: ITEM_BASE + i,
        Name: `市場測試-${i}`,
        Star: "3",
        HeadImage_Url: `https://example.test/${ITEM_BASE + i}.png`,
        Rate: "1%",
      }))
    );
  }, 180000);

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
    await mysql("public_market").del();
    await mysql("inventory").del();
    // character_fragments 刻意「不」清空 —— 正式環境的餘額列歸零也不刪，而被刪除
    // 標記的索引項會堆在同一個 unique key 槽位上，製造出正式環境不存在的鎖形狀。
    // 每個測試用不重複的 userId，天然互不干擾。
  });

  // -------------------------------------------------------------------------
  // 死鎖迴歸（本次修復的主題）。任一個 case 轉紅代表鎖或隔離等級被改回會死鎖的版本。
  // -------------------------------------------------------------------------
  describe("gap lock 死鎖", () => {
    it("A↔B 反向角色交易 40 組 80 筆：0 死鎖，且每隻角色恰好存在一份", async () => {
      // 修復前實測 39/80 ER_LOCK_DEADLOCK。InnoDB deadlock graph 的等待邊是
      // idx_inventory_userId_itemId 上的「lock_mode X locks gap before rec insert
      // intention waiting」：買方還沒有 999 列時 `SUM(itemAmount) FOR UPDATE` 鎖的是
      // 空區間，兩個相鄰 userId 鎖到同一個 gap，接著各自 INSERT 女神石異動就成環。
      const pairs = 40;
      const jobs = [];

      for (let p = 0; p < pairs; p++) {
        const a = U(100 + 2 * p);
        const b = U(100 + 2 * p + 1);
        const itemA = ITEM_BASE + 2 * p;
        const itemB = ITEM_BASE + 2 * p + 1;

        await giveCharacter(a, itemA);
        await giveCharacter(b, itemB);
        await giveGodStone(a, 100000);
        await giveGodStone(b, 100000);

        jobs.push({ id: await createSellListing(a, itemA), buyer: b, item: itemA, seller: a });
        jobs.push({ id: await createSellListing(b, itemB), buyer: a, item: itemB, seller: b });
      }

      const gate = barrier(jobs.length);
      const settled = await Promise.allSettled(
        jobs.map(async ({ id, buyer }) => {
          await gate();
          return Service.purchase(id, buyer);
        })
      );

      const result = summarize(settled);
      expect(result.otherErrors).toEqual([]);
      expect(result.deadlocks).toBe(0);
      expect(result.ok).toBe(jobs.length);

      // 資產守恆：每隻角色只能存在一份，不能憑空多出來也不能消失。
      for (const { item, buyer, seller } of jobs) {
        expect(await ownedRows(buyer, item)).toHaveLength(1);
        expect(await ownedRows(seller, item)).toHaveLength(0);
      }
    }, 180000);

    it("買家完全沒有 999 列（gap 的觸發條件）：0 死鎖，且一律被足額檢查擋下", async () => {
      // 「沒有任何 999 列」正是 FOR UPDATE 只能鎖到空區間的情境。這裡同時驗證
      // 規避死鎖沒有把足額檢查放寬 —— 餘額 0 必須買不起。
      const seller = U(300);
      const count = 20;
      const jobs = [];

      for (let i = 0; i < count; i++) {
        const item = ITEM_BASE + i;
        await giveCharacter(seller, item);
        jobs.push({ id: await createSellListing(seller, item), buyer: U(310 + i), item });
      }

      const gate = barrier(jobs.length);
      const settled = await Promise.allSettled(
        jobs.map(async ({ id, buyer }) => {
          await gate();
          return Service.purchase(id, buyer);
        })
      );

      const result = summarize(settled);
      expect(result.otherErrors).toEqual([]);
      expect(result.deadlocks).toBe(0);
      expect(result.ok).toBe(0);
      expect(result.codes).toEqual(Array(count).fill("INSUFFICIENT_FUNDS"));

      // 一隻角色都不能交付，賣家全部留著，也不能生出女神石。
      for (const { buyer, item } of jobs) {
        expect(await ownedRows(buyer, item)).toHaveLength(0);
        expect(await ownedRows(seller, item)).toHaveLength(1);
      }
      expect(await godStoneOf(seller)).toBe(0);
    }, 120000);

    it("反向碎片交易 20 組 40 筆：0 死鎖、片數守恆", async () => {
      const pairs = 20;
      const jobs = [];

      for (let p = 0; p < pairs; p++) {
        const a = U(400 + 2 * p);
        const b = U(400 + 2 * p + 1);
        const item = ITEM_BASE + 60 + p;

        await FragmentModel.increase(a, item, 100);
        await FragmentModel.increase(b, item, 100);
        await giveGodStone(a, 100000);
        await giveGodStone(b, 100000);

        for (const [sellerId, buyerId] of [
          [a, b],
          [b, a],
        ]) {
          const id = Number(
            await PublicMarketModel.create({
              order_type: "sell",
              seller_id: sellerId,
              item_id: item,
              item_kind: "fragment",
              quantity: 20,
              price: 10,
              fee: Service.calcFee(200),
              status: "open",
            })
          );
          jobs.push({ id, buyer: buyerId });
        }
      }

      const gate = barrier(jobs.length);
      const settled = await Promise.allSettled(
        jobs.map(async ({ id, buyer }) => {
          await gate();
          return Service.purchase(id, buyer);
        })
      );

      const result = summarize(settled);
      expect(result.otherErrors).toEqual([]);
      expect(result.deadlocks).toBe(0);
      expect(result.ok).toBe(jobs.length);

      for (let p = 0; p < pairs; p++) {
        const item = ITEM_BASE + 60 + p;
        const total =
          (await fragmentBalanceOf(U(400 + 2 * p), item)) +
          (await fragmentBalanceOf(U(400 + 2 * p + 1), item));
        expect(total).toBe(200);
      }
    }, 180000);
  });

  // -------------------------------------------------------------------------
  // 重複持有與超賣。角色是二元持有，這幾個 case 是資產完整性的底線。
  // -------------------------------------------------------------------------
  describe("重複持有與超賣", () => {
    it("同一買家搶同一角色的兩張賣單：恰 1 筆成功、只扣一次錢、只有一列", async () => {
      const s1 = U(500);
      const s2 = U(501);
      const buyer = U(502);
      const item = ITEM_BASE + 90;

      await giveCharacter(s1, item);
      await giveCharacter(s2, item);
      await giveGodStone(buyer, 5000);

      const ids = [await createSellListing(s1, item), await createSellListing(s2, item)];

      const gate = barrier(ids.length);
      const settled = await Promise.allSettled(
        ids.map(async id => {
          await gate();
          return Service.purchase(id, buyer);
        })
      );

      const result = summarize(settled);
      expect(result.deadlocks).toBe(0);
      expect(result.ok).toBe(1);
      expect(result.codes).toEqual(["ALREADY_OWNED"]);
      // 二元持有：絕不能出現兩列
      expect(await ownedRows(buyer, item)).toHaveLength(1);
      // 只付一次
      expect(await godStoneOf(buyer)).toBe(4900);
    }, 60000);

    it("兩個買家搶同一張單：恰 1 筆成功、資產只轉移一次、賣家只入帳一次", async () => {
      const seller = U(510);
      const b1 = U(511);
      const b2 = U(512);
      const item = ITEM_BASE + 91;

      await giveCharacter(seller, item);
      await giveGodStone(b1, 5000);
      await giveGodStone(b2, 5000);

      const id = await createSellListing(seller, item);

      const gate = barrier(2);
      const settled = await Promise.allSettled(
        [b1, b2].map(async buyer => {
          await gate();
          return Service.purchase(id, buyer);
        })
      );

      const result = summarize(settled);
      expect(result.deadlocks).toBe(0);
      expect(result.ok).toBe(1);
      expect(result.codes).toEqual(["ALREADY_TAKEN"]);

      const moved = (await ownedRows(b1, item)).length + (await ownedRows(b2, item)).length;
      expect(moved).toBe(1);
      expect(await ownedRows(seller, item)).toHaveLength(0);
      // 只有一個買家付了 100，賣家實收 100 - ceil(5%) = 95
      expect((await godStoneOf(b1)) + (await godStoneOf(b2))).toBe(9900);
      expect(await godStoneOf(seller)).toBe(95);
    }, 60000);

    it("角色 purchase 對打碎片 redeem（同一買家同一角色）：不重複持有、不重複付款", async () => {
      // 兩條路徑都會把同一隻角色發給同一個人，且都以 character_fragments 的
      // (user, item) 列為序列化點。修復前實測 30 回有 28 回重複持有。
      const rounds = 12;

      for (let r = 0; r < rounds; r++) {
        const seller = U(600 + r * 3);
        const buyer = U(601 + r * 3);
        const item = ITEM_BASE + 95 + (r % 20);

        await giveCharacter(seller, item);
        await giveGodStone(buyer, 5000);
        await FragmentModel.increase(buyer, item, REDEEM_COST);

        const id = await createSellListing(seller, item);

        const gate = barrier(2);
        const settled = await Promise.allSettled([
          (async () => {
            await gate();
            return Service.purchase(id, buyer);
          })(),
          (async () => {
            await gate();
            return CharacterFragmentService.redeem(buyer, item);
          })(),
        ]);

        const result = summarize(settled);
        expect(result.otherErrors).toEqual([]);
        expect(result.deadlocks).toBe(0);
        expect(result.ok).toBe(1);
        // 恰好一列 —— 兩條路徑不能各發一隻
        expect(await ownedRows(buyer, item)).toHaveLength(1);

        // 只能付一種代價：市場的 100 女神石，或兌換的 150 碎片，不能都付也不能都不付。
        const spent = 5000 - (await godStoneOf(buyer));
        const fragmentsLeft = await fragmentBalanceOf(buyer, item);
        const paidWithMoney = spent === 100 && fragmentsLeft === REDEEM_COST;
        const paidWithFragments = spent === 0 && fragmentsLeft === 0;
        expect(paidWithMoney || paidWithFragments).toBe(true);
      }
    }, 180000);

    it("買家從兩條市場路徑同時收到同一角色（且完全沒有碎片列）：不重複持有", async () => {
      // 這是 increase(..., 0) 那次 upsert 存在的理由。買家從沒碰過這隻角色的碎片，
      // 所以 character_fragments 上「沒有那一列」—— 直接 FOR UPDATE 鎖的是空區間，
      // 拿到的是可共存的 gap lock，兩條路徑會各自驗到「還沒持有」而各發一隻。
      // 先 upsert 把列變出來，鎖才是真正的互斥。
      // 實測拿掉那行 upsert：25 回有 24 回買家持有兩列。
      const rounds = 12;

      for (let r = 0; r < rounds; r++) {
        const buyer = U(900 + r * 4);
        const s1 = U(901 + r * 4);
        const s2 = U(902 + r * 4);
        const item = ITEM_BASE + 20 + (r % 15);

        await giveCharacter(s1, item);
        await giveCharacter(s2, item);
        await giveGodStone(buyer, 5000);
        // 刻意「不」給買家任何碎片 —— 那一列必須不存在，才測得到 gap。
        expect(await fragmentBalanceOf(buyer, item)).toBeNull();

        const sellId = await createSellListing(s1, item);
        const buyOrder = await Service.createListing(buyer, {
          itemId: item,
          price: 200,
          orderType: "buy",
        });
        expect(buyOrder.ok).toBe(true);

        const gate = barrier(2);
        const settled = await Promise.allSettled([
          // 買家自己去買 s1 的賣單
          (async () => {
            await gate();
            return Service.purchase(sellId, buyer);
          })(),
          // 同時 s2 履約買家的收購單
          (async () => {
            await gate();
            return Service.fulfill(buyOrder.listing.id, s2);
          })(),
        ]);

        const result = summarize(settled);
        expect(result.otherErrors).toEqual([]);
        expect(result.deadlocks).toBe(0);
        // 角色是二元持有：兩條路徑不能各發一隻
        expect(await ownedRows(buyer, item)).toHaveLength(1);
      }
    }, 180000);

    it("同一賣家的唯一角色同時被買走與被用於履約：只轉移一次，不超賣", async () => {
      const rounds = 10;

      for (let r = 0; r < rounds; r++) {
        const seller = U(700 + r * 4);
        const directBuyer = U(701 + r * 4);
        const orderBuyer = U(702 + r * 4);
        const item = ITEM_BASE + 40 + (r % 15);

        await giveCharacter(seller, item);
        await giveGodStone(directBuyer, 5000);
        await giveGodStone(orderBuyer, 5000);

        const sellId = await createSellListing(seller, item);
        const buyOrder = await Service.createListing(orderBuyer, {
          itemId: item,
          price: 200,
          orderType: "buy",
        });
        expect(buyOrder.ok).toBe(true);

        const gate = barrier(2);
        const settled = await Promise.allSettled([
          (async () => {
            await gate();
            return Service.purchase(sellId, directBuyer);
          })(),
          (async () => {
            await gate();
            return Service.fulfill(buyOrder.listing.id, seller);
          })(),
        ]);

        const result = summarize(settled);
        expect(result.otherErrors).toEqual([]);
        expect(result.deadlocks).toBe(0);
        // 賣家只有一隻，只能成交一筆
        expect(result.ok).toBe(1);

        const copies =
          (await ownedRows(seller, item)).length +
          (await ownedRows(directBuyer, item)).length +
          (await ownedRows(orderBuyer, item)).length;
        expect(copies).toBe(1);
      }
    }, 180000);
  });

  // -------------------------------------------------------------------------
  // 金流語意：修復不得改變任何一位數字。
  // -------------------------------------------------------------------------
  describe("金流語意", () => {
    it("賣家掛單後失去角色：轉 invalid、買家一毛不扣", async () => {
      const seller = U(800);
      const buyer = U(801);
      const item = ITEM_BASE + 30;

      await giveGodStone(buyer, 5000);
      // 賣家從頭到尾沒有這隻角色（等同掛單後被其他功能消耗掉）
      const id = await createSellListing(seller, item);

      const res = await Service.purchase(id, buyer);

      expect(res).toEqual({ ok: false, code: "SELLER_LOST_ITEM" });
      expect((await mysql("public_market").where({ id }).first()).status).toBe("invalid");
      expect(await godStoneOf(buyer)).toBe(5000);
      expect(await godStoneOf(seller)).toBe(0);
      expect(await ownedRows(buyer, item)).toHaveLength(0);
    }, 60000);

    it("買家女神石不足時擋下，資產與餘額都不動", async () => {
      const seller = U(810);
      const buyer = U(811);
      const item = ITEM_BASE + 31;

      await giveCharacter(seller, item);
      await giveGodStone(buyer, 99);

      const res = await Service.purchase(await createSellListing(seller, item, 100), buyer);

      expect(res).toEqual({
        ok: false,
        code: "INSUFFICIENT_FUNDS",
        balance: 99,
        price: 100,
        shortfall: 1,
      });
      expect(await godStoneOf(buyer)).toBe(99);
      expect(await ownedRows(buyer, item)).toHaveLength(0);
      expect(await ownedRows(seller, item)).toHaveLength(1);
    }, 60000);

    it("收購單：預扣總額、履約不二次扣款、履約者實收總額 - 手續費", async () => {
      const buyer = U(820);
      const seller = U(821);
      const item = ITEM_BASE + 32;

      await giveGodStone(buyer, 1000);
      await giveCharacter(seller, item);

      const created = await Service.createListing(buyer, {
        itemId: item,
        price: 300,
        orderType: "buy",
      });
      expect(created.ok).toBe(true);
      // 發單當下就預扣 300
      expect(await godStoneOf(buyer)).toBe(700);

      const ff = await Service.fulfill(created.listing.id, seller);
      expect(ff.ok).toBe(true);

      // 買家不再被扣款
      expect(await godStoneOf(buyer)).toBe(700);
      // 履約者實收 300 - ceil(300 * 5%) = 285
      expect(await godStoneOf(seller)).toBe(285);
      expect(await ownedRows(buyer, item)).toHaveLength(1);
      expect(await ownedRows(seller, item)).toHaveLength(0);
    }, 60000);

    it("收購單取消：預扣全額退回，且只退一次", async () => {
      const buyer = U(830);
      const item = ITEM_BASE + 33;

      await giveGodStone(buyer, 1000);

      const created = await Service.createListing(buyer, {
        itemId: item,
        price: 250,
        orderType: "buy",
      });
      expect(await godStoneOf(buyer)).toBe(750);

      const cancelled = await Service.cancelListing(created.listing.id, buyer);
      expect(cancelled).toMatchObject({ ok: true, refundedAmount: 250 });
      expect(await godStoneOf(buyer)).toBe(1000);

      // 再取消一次不能再退款
      const again = await Service.cancelListing(created.listing.id, buyer);
      expect(again).toEqual({ ok: false, code: "NOT_OPEN" });
      expect(await godStoneOf(buyer)).toBe(1000);
    }, 60000);

    it("並發取消同一張收購單：只退一次款", async () => {
      const buyer = U(840);
      const item = ITEM_BASE + 34;

      await giveGodStone(buyer, 1000);
      const created = await Service.createListing(buyer, {
        itemId: item,
        price: 250,
        orderType: "buy",
      });

      const gate = barrier(2);
      const settled = await Promise.allSettled(
        Array.from({ length: 2 }, async () => {
          await gate();
          return Service.cancelListing(created.listing.id, buyer);
        })
      );

      const result = summarize(settled);
      expect(result.deadlocks).toBe(0);
      expect(result.ok).toBe(1);
      // 退款金額精確：750 + 250 = 1000，不能是 1250
      expect(await godStoneOf(buyer)).toBe(1000);
    }, 60000);

    it("買家在收購單開放期間自己取得角色：單子作廢並全額退款", async () => {
      const buyer = U(850);
      const seller = U(851);
      const item = ITEM_BASE + 35;

      await giveGodStone(buyer, 1000);
      await giveCharacter(seller, item);

      const created = await Service.createListing(buyer, {
        itemId: item,
        price: 400,
        orderType: "buy",
      });
      expect(await godStoneOf(buyer)).toBe(600);

      // 買家自己抽到了
      await giveCharacter(buyer, item);

      const res = await Service.fulfill(created.listing.id, seller);

      expect(res).toMatchObject({
        ok: false,
        code: "ALREADY_OWNED_REQUESTER",
        refundedAmount: 400,
      });
      expect((await mysql("public_market").where({ id: created.listing.id }).first()).status).toBe(
        "invalid"
      );
      // 全額退回
      expect(await godStoneOf(buyer)).toBe(1000);
      // 履約者的角色沒被拿走
      expect(await ownedRows(seller, item)).toHaveLength(1);
    }, 60000);
  });
});
