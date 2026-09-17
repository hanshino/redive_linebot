// 兌換交易的真實 DB 整合測試（docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §7/§8/§11）。
//
// 與 SubscribeController.redeem.unit.test.js（全 mock 決策分支）不同，這支測試：
//   - 用 worldBossFixture 建一個本機 Docker MySQL 上的獨立測試 DB（Princess_wbtest_redeem_*），
//     跑完整 migration，結束後只 DROP 自己這顆 DB。
//   - 不 mock DB / model / transaction；只 mock LINE 訊息以外的外部副作用
//     （DailyRation、gacha 快取清除、成就引擎/通知）。
//   - 併發情境用「holder 交易先持鎖 → 兩筆兌換真的卡在 InnoDB lock wait → 釋放」製造重疊，
//     以 knex 的 query / query-response 事件判定「FOR UPDATE 已送出但尚未回應」當 barrier，
//     不靠固定 sleep 假定兩筆 SQL 同時進入。只斷言結果不變量，不斷言引擎必定回哪種錯誤碼。
const path = require("path");
const { execFileSync } = require("child_process");

require("dotenv").config({ path: path.resolve(__dirname, "../../../../../.env"), quiet: true });

// ---- 安全護欄：只允許本機 Docker MySQL，禁止任何遠端主機 -------------------------------
function assertLocalDockerMysql() {
  const host = process.env.DB_HOST;
  if (!["localhost", "127.0.0.1"].includes(host)) {
    throw new Error(`refuse: DB_HOST is not local (${host})`);
  }
  const port = process.env.DB_PORT || "3306";
  let names;
  try {
    names = execFileSync(
      "docker",
      ["ps", "--filter", `publish=${port}`, "--format", "{{.Names}}"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    ).trim();
  } catch (error) {
    throw new Error(`refuse: cannot confirm local Docker MySQL via docker ps (${error.code})`, {
      cause: error,
    });
  }
  if (!names) throw new Error(`refuse: no local Docker container publishes port ${port}`);
  return names;
}
const DOCKER_MYSQL_CONTAINER = assertLocalDockerMysql();

const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../../__tests__/helpers/worldBossFixture");

const testDatabase = createWorldBossTestDatabase("redeem");
const mysql = testDatabase.mysql;
// 全域 setup.js 的 mock knex 在這裡被真 knex 取代；必須在任何 model/controller require 之前。
jest.mock("../../../util/mysql", () => mysql);

// 全域 setup.js 把 bottender/router 的 text() mock 成丟棄 handler 的 jest.fn()，這裡要真 handler。
jest.unmock("bottender/router");

// 外部副作用：不打 Redis、不跑每日配給、不評估成就、不推 LINE 通知。
jest.mock("../../princess/gacha", () => ({ purgeDailyGachaCache: jest.fn().mockResolvedValue() }));
jest.mock("../../../../bin/DailyRation", () => jest.fn().mockResolvedValue());
jest.mock("../../../service/AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));
jest.mock("../../../service/achievementNotifier", () => ({
  notifyUnlocks: jest.fn().mockResolvedValue(undefined),
}));
// uuid-random 只在「發卡失敗回滾」情境被強制回傳既有序號，讓真 DB 的唯一鍵去拒絕 INSERT。
jest.mock("uuid-random", () => {
  const actual = jest.requireActual("uuid-random");
  const fn = () => (fn.forced.length ? fn.forced.shift() : actual());
  fn.forced = [];
  return fn;
});

const moment = require("moment");
const uuid = require("uuid-random");
const GachaController = require("../../princess/gacha");
const DailyRation = require("../../../../bin/DailyRation");
const { inventory: inventoryModel } = require("../../../model/application/Inventory");
const SubscribeController = require("../SubscribeController");
const SponsorshipService = require("../../../service/SponsorshipService");
const IssueSubscribeCard = require("../../../../bin/IssueSubscribeCard");
const CleanExpiredSubscriber = require("../../../../bin/CleanExpiredSubscriber");

jest.setTimeout(60000);

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_DURATION_DAYS = 30;
const LINE = ch => "U" + ch.repeat(32);
const OPERATOR = LINE("f");

// ---- knex 事件追蹤：in-flight 查詢 = 已送出 query 但尚未收到 query-response/query-error ----
const inflight = new Map();
const observedErrorCodes = [];
let lockQueryCount = 0;
mysql.on("query", q => {
  if (!q.__knexQueryUid) return;
  inflight.set(q.__knexQueryUid, q.sql);
  if (/for update/i.test(q.sql)) lockQueryCount += 1;
});
mysql.on("query-response", (_res, q) => inflight.delete(q.__knexQueryUid));
mysql.on("query-error", (err, q) => {
  inflight.delete(q.__knexQueryUid);
  if (err && err.code) observedErrorCodes.push(err.code);
});

function countInflight(re) {
  return [...inflight.values()].filter(sql => re.test(sql)).length;
}

async function waitUntil(predicate, { timeout = 15000, interval = 20 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

/**
 * holder 交易先執行 lockFn 取得鎖 → 啟動兩筆兌換 → 等到 blockedRe 的 FOR UPDATE 有 expected 筆
 * 卡在 lock wait → 釋放 holder → 等兩筆兌換結束。任何情況 finally 都會釋放 holder，
 * 且不等待超過 timeout；回傳「釋放前是否真的觀察到 expected 筆重疊」供斷言。
 */
async function runOverlapped({ lockFn, start, blockedRe, expected = 2, timeout = 15000 }) {
  const holder = await mysql.transaction();
  let pending;
  let overlapped;
  try {
    await lockFn(holder);
    pending = start();
    overlapped = await waitUntil(() => countInflight(blockedRe) === expected, { timeout });
    await holder.rollback();
    await pending;
  } finally {
    if (!holder.isCompleted()) await holder.rollback();
    if (pending) await pending.catch(() => {});
  }
  return overlapped;
}

// ---- LINE context 假物件：不發任何訊息 -------------------------------------------------
function ctx(userId) {
  return {
    event: { source: { userId } },
    replyText: jest.fn().mockResolvedValue(undefined),
    sendText: jest.fn().mockResolvedValue(undefined),
    replyFlex: jest.fn().mockResolvedValue(undefined),
  };
}

function repliesOf(context) {
  return context.replyText.mock.calls.map(args => args[0]).join("\n");
}

function callExchange(context, serialNumber) {
  const route = SubscribeController.router.find(
    r => typeof r.predicate === "function" && r.action.name === "subscribeCouponExchange"
  );
  return route.action(context, { match: { groups: { serial_number: serialNumber } } });
}

function callBuyMonthCard(context, number) {
  return SubscribeController.privateRouter[0].action(context, {
    match: { groups: { number } },
  });
}

// ---- 測試 DB 內的 seed / 查詢 helper ------------------------------------------------------
async function seedCoupon(cardKey = "month") {
  const serial = uuid();
  await mysql("subscribe_card_coupon").insert({
    subscribe_card_key: cardKey,
    serial_number: serial,
    status: 0,
    issued_by: "redeem-test",
  });
  return serial;
}

function coupon(serial) {
  return mysql("subscribe_card_coupon").where({ serial_number: serial }).first();
}

function subscriptions(userId) {
  return mysql("subscribe_user").where({ user_id: userId }).orderBy("id");
}

async function seedLineUser(platformId) {
  const [id] = await mysql("user").insert({ platform: "line", platform_id: platformId });
  return id;
}

async function godStone(userId) {
  const row = await mysql("inventory")
    .sum({ amount: "itemAmount" })
    .where({ userId, itemId: 999 })
    .first();
  return row.amount === null ? null : Number(row.amount);
}

function count(table) {
  return mysql(table)
    .count({ c: "*" })
    .first()
    .then(r => Number(r.c));
}

function ms(value) {
  return new Date(value).getTime();
}

function expectWithin(actual, expected, toleranceMs) {
  expect(Math.abs(ms(actual) - ms(expected))).toBeLessThanOrEqual(toleranceMs);
}

// ==========================================================================================
describe("SubscribeController redeem — 真實隔離 DB", () => {
  let connectedDatabase;

  beforeAll(async () => {
    connectedDatabase = await testDatabase.setup();
    expect(connectedDatabase).toMatch(/^Princess_wbtest_redeem_/);
    // 只塞測試需要的卡種，不讀線上設定。
    await mysql("subscribe_card").insert({
      key: "month",
      name: "月卡",
      price: 50,
      duration: MONTH_DURATION_DAYS,
      effects: JSON.stringify([{ type: "gacha_times", value: 1 }]),
    });
  }, SETUP_TIMEOUT_MS);

  afterAll(() => testDatabase.teardown());

  beforeEach(() => {
    jest.clearAllMocks();
    uuid.forced.length = 0;
  });

  // ---------------------------------------------------------------------------------------
  describe("smoke：fresh migration 與連線目標", () => {
    it("util/mysql 已被真 knex 取代，且連到自己 generated 的測試 DB（非 Princess）", async () => {
      expect(require("../../../util/mysql")).toBe(mysql);

      const [rows] = await mysql.raw("SELECT DATABASE() AS db");
      expect(rows[0].db).toBe(testDatabase.databaseName);
      expect(rows[0].db).not.toBe("Princess");
      expect(rows[0].db.startsWith(testDatabase.namePrefix)).toBe(true);
      expect(DOCKER_MYSQL_CONTAINER).not.toBe("");

      const [iso] = await mysql.raw(
        "SELECT @@transaction_isolation AS iso, @@innodb_lock_wait_timeout AS lwt"
      );
      // gap lock 行為取決於 isolation；這裡只記錄不強制，讓結果不變量斷言在兩種 isolation 下都成立。
      expect(["REPEATABLE-READ", "READ-COMMITTED"]).toContain(iso[0].iso);
      console.info(
        `[redeem.test] db=${rows[0].db} isolation=${iso[0].iso} lock_wait_timeout=${iso[0].lwt}s docker=${DOCKER_MYSQL_CONTAINER}`
      );
    });

    it("migration 建出兌換流程所需的表", async () => {
      for (const table of [
        "subscribe_card",
        "subscribe_card_coupon",
        "subscribe_user",
        "sponsorship",
        "sponsorship_audit",
        "inventory",
        "user",
      ]) {
        expect(await mysql.schema.hasTable(table)).toBe(true);
      }
      expect(await mysql.schema.hasColumn("subscribe_card_coupon", "sponsorship_id")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("④ 首次兌換：無既有 subscribe_user", () => {
    it("建立一列，start_at≈now、end_at=start_at+30d，序號標記 used", async () => {
      const user = LINE("4");
      await seedLineUser(user);
      const serial = await seedCoupon();
      const c = ctx(user);

      const before = Date.now();
      await callExchange(c, serial);
      const after = Date.now();

      const rows = await subscriptions(user);
      expect(rows).toHaveLength(1);
      expect(rows[0].subscribe_card_key).toBe("month");
      expect(ms(rows[0].start_at)).toBeGreaterThanOrEqual(before - 1000);
      expect(ms(rows[0].start_at)).toBeLessThanOrEqual(after + 1000);
      expectWithin(rows[0].end_at, ms(rows[0].start_at) + MONTH_DURATION_DAYS * DAY_MS, 1000);

      const cp = await coupon(serial);
      expect(cp.status).toBe(1);
      expect(cp.used_by).toBe(user);
      expect(cp.used_at).not.toBeNull();

      const replies = repliesOf(c);
      expect(replies).toContain("message.subscribe.coupon_exchange_success");
      expect(replies).not.toContain("coupon_exchange_success_continue");
      expect(DailyRation).toHaveBeenCalledTimes(1);
      expect(GachaController.purgeDailyGachaCache).toHaveBeenCalledWith(user);
    });

    it("查無序號 / 已使用序號：不寫入任何 subscribe_user", async () => {
      const user = LINE("e");
      await seedLineUser(user);
      const used = await seedCoupon();
      await mysql("subscribe_card_coupon")
        .where({ serial_number: used })
        .update({ status: 1, used_by: LINE("d") });

      const c1 = ctx(user);
      await callExchange(c1, uuid());
      expect(c1.sendText).toHaveBeenCalledWith("message.subscribe.serial_number_not_found");

      const c2 = ctx(user);
      await callExchange(c2, used);
      expect(repliesOf(c2)).toContain("message.subscribe.serial_number_used");

      expect(await subscriptions(user)).toHaveLength(0);
      expect((await coupon(used)).used_by).toBe(LINE("d"));
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("① 兩個玩家同時兌換同一序號", () => {
    it("兩筆交易真的同時卡在 coupon 列鎖；釋放後只有一人取得權益，另一人明確得到「序號已使用」", async () => {
      const A = LINE("a");
      const B = LINE("b");
      await seedLineUser(A);
      await seedLineUser(B);
      const serial = await seedCoupon();
      const cA = ctx(A);
      const cB = ctx(B);

      const overlapped = await runOverlapped({
        lockFn: holder =>
          holder("subscribe_card_coupon").where({ serial_number: serial }).forUpdate(),
        start: () => Promise.all([callExchange(cA, serial), callExchange(cB, serial)]),
        blockedRe: /subscribe_card_coupon.*for update/i,
      });
      expect(overlapped).toBe(true);

      const cp = await coupon(serial);
      expect(cp.status).toBe(1);
      expect([A, B]).toContain(cp.used_by);
      const winner = cp.used_by;
      const loser = winner === A ? B : A;
      const [cWin, cLose] = winner === A ? [cA, cB] : [cB, cA];

      expect(await subscriptions(winner)).toHaveLength(1);
      expect(await subscriptions(loser)).toHaveLength(0);
      expect(repliesOf(cWin)).toContain("message.subscribe.coupon_exchange_success");
      expect(repliesOf(cLose)).toContain("message.subscribe.serial_number_used");
      expect(repliesOf(cLose)).not.toContain("coupon_exchange_success");
      expect(GachaController.purgeDailyGachaCache).toHaveBeenCalledTimes(1);
      expect(GachaController.purgeDailyGachaCache).toHaveBeenCalledWith(winner);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("② 同一玩家已有有效訂閱，同時兌換兩張不同序號", () => {
    it("兩筆同時卡在 user 列鎖（KTD11 鎖序 user 先於 subscribe_user）；釋放後兩張都成功、end_at 完整疊加兩次時長", async () => {
      const user = LINE("2");
      await seedLineUser(user);
      const startAt = new Date(Math.floor((Date.now() - 5 * DAY_MS) / 1000) * 1000);
      const endAt = new Date(Math.floor((Date.now() + 10 * DAY_MS) / 1000) * 1000);
      await mysql("subscribe_user").insert({
        user_id: user,
        subscribe_card_key: "month",
        start_at: startAt,
        end_at: endAt,
      });
      const [s1, s2] = [await seedCoupon(), await seedCoupon()];
      const c1 = ctx(user);
      const c2 = ctx(user);

      // KTD11 鎖序固定為 user → coupon → subscribe_user → preference：兩筆兌換會先卡在
      // user 列鎖（早於原本斷言的 subscribe_user 列鎖），故 holder 與 blockedRe 都改鎖 user
      // 表，比照下方 ⑩ 的作法；重疊後的行為結果（延長不變量）維持原斷言不變。
      const overlapped = await runOverlapped({
        lockFn: holder => holder("user").where({ platform_id: user }).forUpdate().first("id"),
        start: () => Promise.all([callExchange(c1, s1), callExchange(c2, s2)]),
        blockedRe: /from `user`.*for update/i,
      });
      expect(overlapped).toBe(true);

      const rows = await subscriptions(user);
      expect(rows).toHaveLength(1);
      expect(ms(rows[0].start_at)).toBe(ms(startAt));
      expect(ms(rows[0].end_at)).toBe(
        moment(endAt)
          .add(2 * MONTH_DURATION_DAYS, "days")
          .valueOf()
      );

      for (const s of [s1, s2]) {
        const cp = await coupon(s);
        expect(cp.status).toBe(1);
        expect(cp.used_by).toBe(user);
      }
      for (const c of [c1, c2]) {
        expect(repliesOf(c)).toContain("message.subscribe.coupon_exchange_success_continue");
      }
      expect(DailyRation).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("③ 同一玩家尚無訂閱，同時兌換兩張不同序號", () => {
    it("兩筆同時卡在 subscribe_user 鍵位；釋放後兩張都成功、只留一列、end_at 疊加兩次時長", async () => {
      const user = LINE("3");
      await seedLineUser(user);
      const [s1, s2] = [await seedCoupon(), await seedCoupon()];
      const c1 = ctx(user);
      const c2 = ctx(user);
      const lockQueriesBefore = lockQueryCount;
      const errorsBefore = observedErrorCodes.length;

      const before = Date.now();
      const overlapped = await runOverlapped({
        // holder 先「未提交地」INSERT 同一 (user_id, card_key)，兩筆兌換的 FOR UPDATE 都會卡在
        // 這筆未提交列；ROLLBACK 後兩筆同時看到「查無列」→ 同時搶 INSERT。
        lockFn: holder =>
          holder("subscribe_user").insert({
            user_id: user,
            subscribe_card_key: "month",
            start_at: new Date(),
            end_at: new Date(Date.now() + DAY_MS),
          }),
        start: () => Promise.all([callExchange(c1, s1), callExchange(c2, s2)]),
        blockedRe: /subscribe_user.*for update/i,
      });
      const after = Date.now();
      expect(overlapped).toBe(true);

      const rows = await subscriptions(user);
      expect(rows).toHaveLength(1);
      expect(ms(rows[0].start_at)).toBeGreaterThanOrEqual(before - 1000);
      expect(ms(rows[0].start_at)).toBeLessThanOrEqual(after + 1000);
      expectWithin(rows[0].end_at, ms(rows[0].start_at) + 2 * MONTH_DURATION_DAYS * DAY_MS, 5000);

      for (const s of [s1, s2]) {
        const cp = await coupon(s);
        expect(cp.status).toBe(1);
        expect(cp.used_by).toBe(user);
      }
      const continues = [c1, c2].filter(c =>
        repliesOf(c).includes("message.subscribe.coupon_exchange_success_continue")
      );
      expect(continues).toHaveLength(1);
      for (const c of [c1, c2]) {
        expect(repliesOf(c)).toContain("message.subscribe.coupon_exchange_success");
        expect(repliesOf(c)).not.toContain("message.error_contact_admin");
      }
      expect(DailyRation).toHaveBeenCalledTimes(1);

      // 只記錄、不斷言引擎走的是 deadlock 還是唯一鍵競態（依 isolation 而異）。
      const retried = lockQueryCount - lockQueriesBefore > 4;
      console.info(
        `[redeem.test] ③ retried=${retried} lock_queries=${lockQueryCount - lockQueriesBefore} errors=${JSON.stringify(observedErrorCodes.slice(errorsBefore))}`
      );
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("⑤ 過期清理後重新兌換", () => {
    it("CleanExpiredSubscriber 刪掉過期列後，兌換走建立路徑（新 id），不是延長舊列", async () => {
      const user = LINE("5");
      await seedLineUser(user);
      const [expiredId] = await mysql("subscribe_user").insert({
        user_id: user,
        subscribe_card_key: "month",
        start_at: new Date(Date.now() - 40 * DAY_MS),
        end_at: new Date(Date.now() - 10 * DAY_MS),
      });

      await CleanExpiredSubscriber();
      expect(await subscriptions(user)).toHaveLength(0);

      const serial = await seedCoupon();
      const c = ctx(user);
      const before = Date.now();
      await callExchange(c, serial);
      const after = Date.now();

      const rows = await subscriptions(user);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).not.toBe(expiredId);
      expect(rows[0].id).toBeGreaterThan(expiredId);
      expect(ms(rows[0].start_at)).toBeGreaterThanOrEqual(before - 1000);
      expect(ms(rows[0].start_at)).toBeLessThanOrEqual(after + 1000);
      expectWithin(rows[0].end_at, ms(rows[0].start_at) + MONTH_DURATION_DAYS * DAY_MS, 1000);
      expect(repliesOf(c)).not.toContain("coupon_exchange_success_continue");
      expect(DailyRation).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("⑥ A 贊助發卡、B 兌換", () => {
    it("現金貢獻留在 A、訂閱只給 B；發卡本身不啟用月卡", async () => {
      const aLine = LINE("a").replace(/a/g, "6");
      const bLine = LINE("b").replace(/b/g, "7");
      const aId = await seedLineUser(aLine);
      await seedLineUser(bLine);
      const sponsorshipsBefore = await count("sponsorship");

      const { created, sponsorship, coupons } = await SponsorshipService.create(
        {
          type: "new",
          user_id: aId,
          currency: "TWD",
          amount: "500.00",
          received_at: "2026-09-01T00:00:00Z",
          card_key: "month",
          card_count: 1,
        },
        "redeem-test-sponsor-a",
        OPERATOR
      );
      expect(created).toBe(true);
      expect(coupons).toHaveLength(1);
      const serial = coupons[0].serial_number;

      // 發卡當下：序號綁到 sponsorship、未使用；A、B 都沒有任何訂閱。
      let cp = await coupon(serial);
      expect(cp.sponsorship_id).toBe(sponsorship.id);
      expect(cp.status).toBe(0);
      expect(cp.issued_by).toBe(OPERATOR);
      expect(await subscriptions(aLine)).toHaveLength(0);
      expect(await subscriptions(bLine)).toHaveLength(0);

      const cB = ctx(bLine);
      await callExchange(cB, serial);

      cp = await coupon(serial);
      expect(cp.status).toBe(1);
      expect(cp.used_by).toBe(bLine);
      expect(cp.sponsorship_id).toBe(sponsorship.id);
      expect(await subscriptions(bLine)).toHaveLength(1);
      expect(await subscriptions(aLine)).toHaveLength(0);

      const sp = await mysql("sponsorship").where({ id: sponsorship.id }).first();
      expect(sp.user_id).toBe(aId);
      expect(String(sp.amount)).toBe("500.00");
      const summary = await SponsorshipService.getPlayerSummary(aId);
      expect(summary.totalAmount).toBe("500.00");
      expect(await count("sponsorship")).toBe(sponsorshipsBefore + 1);
      expect(repliesOf(cB)).toContain("message.subscribe.coupon_exchange_success");
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("⑦ CLI 發卡", () => {
    it("IssueSubscribeCard 產出的序號 sponsorship_id 為 NULL、issued_by=system，且不產生 sponsorship", async () => {
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      const maxBefore = await mysql("subscribe_card_coupon")
        .max({ m: "id" })
        .first()
        .then(r => Number(r.m) || 0);
      const sponsorshipsBefore = await count("sponsorship");

      await IssueSubscribeCard({ count: 2, key: "month" });
      logSpy.mockRestore();

      const rows = await mysql("subscribe_card_coupon").where("id", ">", maxBefore);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.sponsorship_id).toBeNull();
        expect(row.issued_by).toBe("system");
        expect(row.status).toBe(0);
        expect(row.subscribe_card_key).toBe("month");
      }
      expect(await count("sponsorship")).toBe(sponsorshipsBefore);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("⑧⑨⑩ 女神石購卡", () => {
    const cost = 50 * 10000;

    async function seedBuyer(user, balance) {
      // 真實玩家一定先經過 setProfile → UserModel.ensureUser，這裡等效補上 user 列。
      await seedLineUser(user);
      if (balance !== null) {
        await mysql("inventory").insert({ userId: user, itemId: 999, itemAmount: balance });
      }
    }

    function couponsAfter(maxBefore) {
      return mysql("subscribe_card_coupon").where("id", ">", maxBefore);
    }

    function maxCouponId() {
      return mysql("subscribe_card_coupon")
        .max({ m: "id" })
        .first()
        .then(r => Number(r.m) || 0);
    }

    function debits(user) {
      return mysql("inventory").where({ userId: user, note: "buy_month_card" });
    }

    const USER_LOCK_RE = /from `user`.*for update/i;

    it("餘額足夠：扣款與發卡同一交易成功；序號無 sponsorship 關聯、不啟用訂閱、不新增贊助", async () => {
      const user = LINE("8");
      await seedBuyer(user, cost);
      const maxBefore = await maxCouponId();
      const sponsorshipsBefore = await count("sponsorship");
      const c = ctx(user);

      await callBuyMonthCard(c, "1");

      expect(await godStone(user)).toBe(0);
      const rows = await couponsAfter(maxBefore);
      expect(rows).toHaveLength(1);
      expect(rows[0].sponsorship_id).toBeNull();
      expect(rows[0].issued_by).toBe("system");
      expect(rows[0].status).toBe(0);
      const ledger = await debits(user);
      expect(ledger).toHaveLength(1);
      expect(Number(ledger[0].itemAmount)).toBe(-cost);
      expect(await subscriptions(user)).toHaveLength(0);
      expect(await count("sponsorship")).toBe(sponsorshipsBefore);
      expect(repliesOf(c)).toContain("message.subscribe.buy_month_card_success");
      expect(repliesOf(c)).toContain("message.subscribe.give_serial_nubmer");
    });

    it("發卡 INSERT 撞真實唯一鍵失敗：整筆回滾，女神石不被扣、不留半張序號、不新增贊助", async () => {
      const user = LINE("9");
      await seedBuyer(user, cost);
      const existing = await seedCoupon();
      const couponsBefore = await count("subscribe_card_coupon");
      const sponsorshipsBefore = await count("sponsorship");
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      // 強制 issue 產出的第一個序號撞既有序號 → 真 DB ER_DUP_ENTRY → 交易 rollback。
      uuid.forced.push(existing);
      const c = ctx(user);

      await callBuyMonthCard(c, "1");
      errorSpy.mockRestore();

      expect(await godStone(user)).toBe(cost);
      expect(await debits(user)).toHaveLength(0);
      expect(await count("subscribe_card_coupon")).toBe(couponsBefore);
      expect(await count("sponsorship")).toBe(sponsorshipsBefore);
      expect(await subscriptions(user)).toHaveLength(0);
      expect(repliesOf(c)).toContain("message.error_contact_admin");
      expect(repliesOf(c)).not.toContain("buy_month_card_success");
      expect(uuid.forced).toHaveLength(0);
    });

    it("issue 真插入成功後 decreaseGodStone 失敗：交易外查無新序號、無扣款列、餘額不變（雙回滾）", async () => {
      const user = LINE("b").replace(/b/g, "e");
      await seedBuyer(user, cost);
      const maxBefore = await maxCouponId();
      const couponsBefore = await count("subscribe_card_coupon");
      const sponsorshipsBefore = await count("sponsorship");
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const original = inventoryModel.decreaseGodStone;
      // 交易內觀察到的中間狀態（用同一個 trx 查，證明 issue 與真 debit 都已寫進交易再被回滾）。
      const insideTrx = { coupons: -1, debits: -1, sameTrx: false };
      const spy = jest.spyOn(inventoryModel, "decreaseGodStone").mockImplementation(async args => {
        const { trx } = args;
        insideTrx.sameTrx = Boolean(trx && trx.isTransaction === true);
        insideTrx.coupons = (await trx("subscribe_card_coupon").where("id", ">", maxBefore)).length;
        // 真的把扣款列也寫進交易，再丟錯 → 證明 issue + debit 兩者一起回滾。
        await original.call(inventoryModel, args);
        insideTrx.debits = (
          await trx("inventory").where({ userId: user, note: "buy_month_card" })
        ).length;
        throw Object.assign(new Error("debit failed after issue"), { code: "TEST_DEBIT_FAIL" });
      });
      const c = ctx(user);

      // mockRestore() 會一併清掉 .mock.calls，呼叫次數與 log 都要在還原前擷取。
      let spyCalls;
      let logged;
      try {
        await callBuyMonthCard(c, "1");
      } finally {
        spyCalls = spy.mock.calls.length;
        logged = errorSpy.mock.calls.map(a => a.join(" ")).join("\n");
        spy.mockRestore();
        errorSpy.mockRestore();
      }

      // 交易內確實走到 issue 之後、debit 之後才失敗，且 controller 只 log 安全分類碼。
      expect(spyCalls).toBe(1);
      expect(logged).toContain("[subscribe] buy month card failed UNKNOWN");
      expect(logged).not.toContain("debit failed after issue");
      expect(insideTrx.sameTrx).toBe(true);
      expect(insideTrx.coupons).toBe(1);
      expect(insideTrx.debits).toBe(1);

      // 交易外：全部回滾。
      expect(await godStone(user)).toBe(cost);
      expect(await debits(user)).toHaveLength(0);
      expect(await couponsAfter(maxBefore)).toHaveLength(0);
      expect(await count("subscribe_card_coupon")).toBe(couponsBefore);
      expect(await count("sponsorship")).toBe(sponsorshipsBefore);
      expect(await subscriptions(user)).toHaveLength(0);
      expect(repliesOf(c)).toContain("message.error_contact_admin");
      expect(repliesOf(c)).not.toContain("buy_month_card_success");
      expect(repliesOf(c)).not.toContain("give_serial_nubmer");
      expect(repliesOf(c)).not.toContain("not_enough_money");
      // spy 已還原：後續 case 走真正的 decreaseGodStone。
      expect(inventoryModel.decreaseGodStone).toBe(original);
    });

    it("餘額不足：不發卡、不扣款，回 not_enough_money", async () => {
      const user = LINE("c");
      await seedBuyer(user, 1);
      const couponsBefore = await count("subscribe_card_coupon");
      const c = ctx(user);

      await callBuyMonthCard(c, "1");

      expect(await godStone(user)).toBe(1);
      expect(await count("subscribe_card_coupon")).toBe(couponsBefore);
      expect(repliesOf(c)).toContain("message.subscribe.not_enough_money");
    });

    it("從未持有女神石（inventory 無任何 999 列）：也視為餘額不足，不得發卡", async () => {
      const user = LINE("0");
      await seedBuyer(user, null);
      expect(await godStone(user)).toBeNull();
      const couponsBefore = await count("subscribe_card_coupon");
      const c = ctx(user);

      await callBuyMonthCard(c, "1");

      expect(await godStone(user)).toBeNull();
      expect(await count("subscribe_card_coupon")).toBe(couponsBefore);
      expect(repliesOf(c)).toContain("message.subscribe.not_enough_money");
      expect(repliesOf(c)).not.toContain("buy_month_card_success");
    });

    it("查無 user 列（鎖不到玩家）：fail closed，不發卡、不扣款，回 error_contact_admin 而非放行", async () => {
      const user = LINE("d");
      // 只有女神石、沒有 user 列：FOR UPDATE 只會拿到 gap lock，不能當同玩家鎖 → 必須拒絕。
      await mysql("inventory").insert({ userId: user, itemId: 999, itemAmount: cost });
      const couponsBefore = await count("subscribe_card_coupon");
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const c = ctx(user);

      await callBuyMonthCard(c, "1");
      const logged = errorSpy.mock.calls.map(a => a.join(" ")).join("\n");
      errorSpy.mockRestore();

      expect(await godStone(user)).toBe(cost);
      expect(await debits(user)).toHaveLength(0);
      expect(await count("subscribe_card_coupon")).toBe(couponsBefore);
      expect(repliesOf(c)).toContain("message.error_contact_admin");
      expect(repliesOf(c)).not.toContain("buy_month_card_success");
      expect(repliesOf(c)).not.toContain("not_enough_money");
      expect(logged).toContain("USER_NOT_FOUND");
    });

    // ⑩ 購卡對購卡競態 regression。
    // baseline（交易外讀 SUM、交易內只 issue+debit）：holder 鎖住 user 列擋不住任何一筆
    //   → 兩筆都不會出現在 `user … FOR UPDATE` 等鎖佇列（overlapped=false），且都讀到 50 萬
    //   → 各買一張、餘額 -50 萬（結果斷言先失敗、給出負餘額證據）。
    // 修正後：兩筆都卡在 user 列鎖（overlapped=true），釋放後序列化 → 第一筆成交、第二筆在
    //   同一交易連線重讀到 0 → not_enough_money。
    it("⑩ 同一人餘額 50 萬同時買兩張：兩筆同時等 user 列鎖，釋放後只成交一張、餘額 0、另一筆 not_enough_money", async () => {
      const user = LINE("1");
      await seedBuyer(user, cost);
      const maxBefore = await maxCouponId();
      const c1 = ctx(user);
      const c2 = ctx(user);

      const overlapped = await runOverlapped({
        lockFn: holder => holder("user").where({ platform_id: user }).forUpdate().first("id"),
        start: () => Promise.all([callBuyMonthCard(c1, "1"), callBuyMonthCard(c2, "1")]),
        blockedRe: USER_LOCK_RE,
        timeout: 5000,
      });

      const balance = await godStone(user);
      const issued = await couponsAfter(maxBefore);
      const ledger = await debits(user);
      const successes = [c1, c2].filter(c =>
        repliesOf(c).includes("message.subscribe.buy_month_card_success")
      );
      const rejections = [c1, c2].filter(c =>
        repliesOf(c).includes("message.subscribe.not_enough_money")
      );
      console.info(
        `[redeem.test] ⑩ race overlapped=${overlapped} balance=${balance} coupons=${issued.length} debits=${ledger.length} successes=${successes.length} not_enough=${rejections.length}`
      );

      expect(balance).toBe(0);
      expect(issued).toHaveLength(1);
      expect(ledger).toHaveLength(1);
      expect(successes).toHaveLength(1);
      expect(rejections).toHaveLength(1);
      for (const c of [c1, c2]) expect(repliesOf(c)).not.toContain("message.error_contact_admin");
      // 重疊證據：兩筆購買曾同時在 InnoDB 等同一把 user 列鎖。
      expect(overlapped).toBe(true);
    });

    it("同一人餘額 100 萬同時買兩張：兩筆同時等 user 列鎖，釋放後兩張都成交、餘額 0", async () => {
      const user = LINE("2").replace(/2/g, "5");
      await seedBuyer(user, 2 * cost);
      const maxBefore = await maxCouponId();
      const c1 = ctx(user);
      const c2 = ctx(user);

      const overlapped = await runOverlapped({
        lockFn: holder => holder("user").where({ platform_id: user }).forUpdate().first("id"),
        start: () => Promise.all([callBuyMonthCard(c1, "1"), callBuyMonthCard(c2, "1")]),
        blockedRe: USER_LOCK_RE,
        timeout: 5000,
      });

      expect(await godStone(user)).toBe(0);
      expect(await couponsAfter(maxBefore)).toHaveLength(2);
      expect(await debits(user)).toHaveLength(2);
      for (const c of [c1, c2]) {
        expect(repliesOf(c)).toContain("message.subscribe.buy_month_card_success");
        expect(repliesOf(c)).not.toContain("not_enough_money");
      }
      expect(overlapped).toBe(true);
    });
  });
});
