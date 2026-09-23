// 月卡 ⇄ Plus 期中折算的真實 DB 整合測試（docs/plans/2026-09-09-sponsorship-subscription-roadmap.md
// §5「2026-09-23 Plus 售價與折算決策」）。
//
// 沿用 SubscribeController.redeem.test.js 的手法：worldBossFixture 建本機 Docker MySQL 上的
// 獨立測試 DB（Princess_wbtest_convert_*），跑完整 migration（含 20260923092351 建出真實
// month_plus 卡種與 20260923083743 修正月卡 price=30），不 mock DB / model / transaction，
// 只 mock LINE 訊息以外的外部副作用。
const path = require("path");
const { execFileSync } = require("child_process");

require("dotenv").config({ path: path.resolve(__dirname, "../../../../../.env"), quiet: true });

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
assertLocalDockerMysql();

const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../../__tests__/helpers/worldBossFixture");

const testDatabase = createWorldBossTestDatabase("convert");
const mysql = testDatabase.mysql;
jest.mock("../../../util/mysql", () => mysql);
jest.unmock("bottender/router");

jest.mock("../../princess/gacha", () => ({ purgeDailyGachaCache: jest.fn().mockResolvedValue() }));
jest.mock("../../../../bin/DailyRation", () => jest.fn().mockResolvedValue());
jest.mock("../../../service/AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));
jest.mock("../../../service/achievementNotifier", () => ({
  notifyUnlocks: jest.fn().mockResolvedValue(undefined),
}));

const uuid = require("uuid-random");
const SubscribeController = require("../SubscribeController");
const DailyRation = require("../../../../bin/DailyRation");

jest.setTimeout(60000);

const DAY_MS = 24 * 60 * 60 * 1000;
const LINE = ch => "U" + ch.repeat(32);

const inflight = new Map();
mysql.on("query", q => q.__knexQueryUid && inflight.set(q.__knexQueryUid, q.sql));
mysql.on("query-response", (_res, q) => inflight.delete(q.__knexQueryUid));
mysql.on("query-error", (_err, q) => inflight.delete(q.__knexQueryUid));

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

async function seedLineUser(platformId) {
  const [id] = await mysql("user").insert({ platform: "line", platform_id: platformId });
  return id;
}

async function seedCoupon(cardKey) {
  const serial = uuid();
  await mysql("subscribe_card_coupon").insert({
    subscribe_card_key: cardKey,
    serial_number: serial,
    status: 0,
    issued_by: "convert-test",
  });
  return serial;
}

function subscriptions(userId) {
  return mysql("subscribe_user").where({ user_id: userId }).orderBy("id");
}

function ms(value) {
  return new Date(value).getTime();
}

function expectWithin(actual, expected, toleranceMs) {
  expect(Math.abs(ms(actual) - ms(expected))).toBeLessThanOrEqual(toleranceMs);
}

// ==========================================================================================
describe("SubscribeController redeem — 月卡 ⇄ Plus 折算（真實隔離 DB）", () => {
  let monthCard;
  let plusCard;

  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_convert_/);
    expect(databaseName).not.toBe("Princess");
    // "month"／"season" 卡種歷來由 seed／人工建立、不是由 migration 產生（比照既有
    // SubscribeController.redeem.test.js / reconsent.test.js 的作法，這裡手動塞測試用卡種）。
    // month_plus 則已由 20260923092351 migration 在 migrate.latest 時建立（真實 price 60/
    // duration 30），不能重複 insert，只讀出來供斷言比例用。
    await mysql("subscribe_card").insert([
      {
        key: "month",
        name: "月卡",
        price: 30,
        duration: 30,
        effects: JSON.stringify([{ type: "gacha_times", value: 1 }]),
      },
      {
        key: "season",
        name: "季卡",
        price: 130,
        duration: 90,
        effects: JSON.stringify([{ type: "gacha_times", value: 2 }]),
      },
    ]);
    monthCard = await mysql("subscribe_card").where({ key: "month" }).first();
    plusCard = await mysql("subscribe_card").where({ key: "month_plus" }).first();
    expect(Number(monthCard.price)).toBe(30);
    expect(Number(plusCard.price)).toBe(60);
  }, SETUP_TIMEOUT_MS);

  afterAll(() => testDatabase.teardown());

  beforeEach(async () => {
    jest.clearAllMocks();
    await mysql("subscribe_user").del();
    await mysql("subscribe_card_coupon").del();
    await mysql("user").del();
  });

  describe("兌 Plus 帶月卡：月卡剩餘時間折算加到 Plus，月卡立刻結束", () => {
    it("持有有效月卡（剩 10 天）兌換 Plus：Plus = 30 天 + 10 天 × 1/2 = 35 天；月卡 end_at=now", async () => {
      const user = LINE("1");
      await seedLineUser(user);
      const startAt = new Date(Date.now() - 20 * DAY_MS);
      const endAt = new Date(Date.now() + 10 * DAY_MS);
      await mysql("subscribe_user").insert({
        user_id: user,
        subscribe_card_key: "month",
        start_at: startAt,
        end_at: endAt,
      });
      const serial = await seedCoupon("month_plus");
      const c = ctx(user);

      const before = Date.now();
      await callExchange(c, serial);
      const after = Date.now();

      const rows = await subscriptions(user);
      const month = rows.find(r => r.subscribe_card_key === "month");
      const plus = rows.find(r => r.subscribe_card_key === "month_plus");

      expect(rows).toHaveLength(2);
      // 月卡立刻結束：end_at ≈ now（兌換當下），不再是原本 +10 天。
      expect(ms(month.end_at)).toBeGreaterThanOrEqual(before - 1000);
      expect(ms(month.end_at)).toBeLessThanOrEqual(after + 1000);

      // Plus 新建：start_at ≈ now，end_at = now + 30 天(卡片本身) + 10 天 × 1/2 折算 = +35 天。
      expect(ms(plus.start_at)).toBeGreaterThanOrEqual(before - 1000);
      expectWithin(plus.end_at, ms(plus.start_at) + 35 * DAY_MS, 2000);

      const replies = repliesOf(c);
      expect(replies).toContain("message.subscribe.conversion_absorbs_other");
      expect(replies).toContain("message.subscribe.coupon_exchange_success_continue");
      // Plus 本身是首次建立（existing Plus row 不存在，isContinue=false），
      // 折算文案只是額外附加訊息，不影響「首次啟用」的既有副作用。
      expect(DailyRation).toHaveBeenCalledTimes(1);
    });

    it("邊界：月卡已過期（end_at 早於 now）不折算，Plus 只拿卡片本身的 30 天", async () => {
      const user = LINE("2");
      await seedLineUser(user);
      // subscribe_user.end_at 是 MySQL timestamp（秒精度，寫入時無條件捨去毫秒），用 1ms
      // 級的邊界在真實 DB 往返 + 網路延遲下無法穩定重現；這裡改用「早於 now 好幾秒」的
      // 明確過期案例。精確到毫秒、不進位的數學本身由 SubscriptionService.convertDurationByPrice
      // 的純函式單元測試覆蓋（見 __tests__/service/SubscriptionService.test.js），這裡只驗證
      // 整合層「過期不折算」的行為分支有沒有走對。
      const startAt = new Date(Date.now() - 40 * DAY_MS);
      const endAt = new Date(Date.now() - 5000); // 5 秒前到期 = 明確已過期
      await mysql("subscribe_user").insert({
        user_id: user,
        subscribe_card_key: "month",
        start_at: startAt,
        end_at: endAt,
      });
      const serial = await seedCoupon("month_plus");
      const c = ctx(user);

      await callExchange(c, serial);

      const rows = await subscriptions(user);
      const plus = rows.find(r => r.subscribe_card_key === "month_plus");
      // 過期月卡不折算：Plus 只有卡片本身 30 天，且過期月卡列原封不動（不被改成 now）。
      expectWithin(plus.end_at, ms(plus.start_at) + 30 * DAY_MS, 2000);
      const month = rows.find(r => r.subscribe_card_key === "month");
      expectWithin(month.end_at, endAt, 1000);
      expect(repliesOf(c)).not.toContain("conversion_absorbs_other");
    });

    it("首次兌換 Plus（無既有月卡）：不觸發折算文案，正常 30 天", async () => {
      const user = LINE("3");
      await seedLineUser(user);
      const serial = await seedCoupon("month_plus");
      const c = ctx(user);

      await callExchange(c, serial);

      const rows = await subscriptions(user);
      expect(rows).toHaveLength(1);
      expectWithin(rows[0].end_at, ms(rows[0].start_at) + 30 * DAY_MS, 2000);
      expect(repliesOf(c)).not.toContain("conversion_absorbs_other");
      expect(DailyRation).toHaveBeenCalledTimes(1);
    });
  });

  describe("兌月卡帶 Plus：月卡不建立/不延長，整段 duration 折算進 Plus", () => {
    it("持有有效 Plus 時兌換月卡（別人送的）：Plus 到期日 += 30 天 × 1/2 = 15 天；不新增 subscribe_user 列", async () => {
      const user = LINE("4");
      await seedLineUser(user);
      const plusStart = new Date(Date.now() - 5 * DAY_MS);
      const plusEnd = new Date(Date.now() + 20 * DAY_MS);
      await mysql("subscribe_user").insert({
        user_id: user,
        subscribe_card_key: "month_plus",
        start_at: plusStart,
        end_at: plusEnd,
      });
      const serial = await seedCoupon("month");
      const c = ctx(user);

      await callExchange(c, serial);

      const rows = await subscriptions(user);
      // 不新增月卡列：只有原本那張 Plus，仍然只有 1 列。
      expect(rows).toHaveLength(1);
      expect(rows[0].subscribe_card_key).toBe("month_plus");
      expectWithin(rows[0].end_at, ms(plusEnd) + 15 * DAY_MS, 2000);

      const replies = repliesOf(c);
      expect(replies).toContain("message.subscribe.conversion_absorbed_by_plus");
      expect(replies).toContain("message.subscribe.coupon_exchange_success_continue");
      // 月卡本身的 effects 不生效、不列出（card 是月卡但實際延長的是 Plus）。
      expect(replies).not.toContain("message.subscribe.effects_row_positive");
      // Plus 本來就有效（inactive→active 不成立），不是「首次啟用」，DailyRation 不該被觸發
      // 成「新建月卡」的立即補發語意。
      expect(DailyRation).not.toHaveBeenCalled();
    });

    it("邊界：Plus 已過期時兌換月卡，不折算，改走月卡自己的正常建立路徑", async () => {
      const user = LINE("5");
      await seedLineUser(user);
      await mysql("subscribe_user").insert({
        user_id: user,
        subscribe_card_key: "month_plus",
        start_at: new Date(Date.now() - 40 * DAY_MS),
        end_at: new Date(Date.now() - 5000), // 5 秒前到期 = 明確已過期
      });
      const serial = await seedCoupon("month");
      const c = ctx(user);

      await callExchange(c, serial);

      const rows = await subscriptions(user);
      const month = rows.find(r => r.subscribe_card_key === "month");
      expect(month).toBeDefined();
      expectWithin(month.end_at, ms(month.start_at) + 30 * DAY_MS, 2000);
      expect(repliesOf(c)).not.toContain("conversion_absorbed_by_plus");
      expect(DailyRation).toHaveBeenCalledTimes(1);
    });
  });

  describe("季卡不參與折算", () => {
    it("持有有效季卡時兌換 Plus：季卡不受影響、不折算，Plus 走正常 30 天", async () => {
      const user = LINE("6");
      await seedLineUser(user);
      const seasonEnd = new Date(Date.now() + 50 * DAY_MS);
      await mysql("subscribe_user").insert({
        user_id: user,
        subscribe_card_key: "season",
        start_at: new Date(Date.now() - 10 * DAY_MS),
        end_at: seasonEnd,
      });
      const serial = await seedCoupon("month_plus");
      const c = ctx(user);

      await callExchange(c, serial);

      const rows = await subscriptions(user);
      const season = rows.find(r => r.subscribe_card_key === "season");
      const plus = rows.find(r => r.subscribe_card_key === "month_plus");
      expectWithin(season.end_at, seasonEnd, 1000); // 完全不動（容許 timestamp 秒級截斷）
      expectWithin(plus.end_at, ms(plus.start_at) + 30 * DAY_MS, 2000);
      expect(repliesOf(c)).not.toContain("conversion");
    });

    it("持有有效 Plus 時兌換季卡：季卡照舊建立自己的列，不折算進 Plus", async () => {
      const user = LINE("7");
      await seedLineUser(user);
      const plusEnd = new Date(Date.now() + 20 * DAY_MS);
      await mysql("subscribe_user").insert({
        user_id: user,
        subscribe_card_key: "month_plus",
        start_at: new Date(Date.now() - 5 * DAY_MS),
        end_at: plusEnd,
      });
      const serial = await seedCoupon("season");
      const c = ctx(user);

      await callExchange(c, serial);

      const rows = await subscriptions(user);
      const season = rows.find(r => r.subscribe_card_key === "season");
      const plus = rows.find(r => r.subscribe_card_key === "month_plus");
      expect(season).toBeDefined();
      expectWithin(plus.end_at, plusEnd, 1000); // Plus 完全不受季卡兌換影響（容許秒級截斷）
      expect(repliesOf(c)).not.toContain("conversion");
    });
  });

  describe("並發兩筆兌換不重複折算", () => {
    it("持有有效月卡時，同時兌換兩張 Plus 序號：兩筆卡在 user 列鎖序列化，月卡只被折算一次", async () => {
      const user = LINE("8");
      await seedLineUser(user);
      const startAt = new Date(Date.now() - 20 * DAY_MS);
      const endAt = new Date(Date.now() + 10 * DAY_MS);
      await mysql("subscribe_user").insert({
        user_id: user,
        subscribe_card_key: "month",
        start_at: startAt,
        end_at: endAt,
      });
      const [s1, s2] = [await seedCoupon("month_plus"), await seedCoupon("month_plus")];
      const c1 = ctx(user);
      const c2 = ctx(user);

      // KTD11 鎖序 user → coupon → subscribe_user → preference：兩筆兌換先卡在 user 列鎖，
      // 比照既有 redeem.test.js ②③⑩ 的作法。
      const overlapped = await runOverlapped({
        lockFn: holder => holder("user").where({ platform_id: user }).forUpdate().first("id"),
        start: () => Promise.all([callExchange(c1, s1), callExchange(c2, s2)]),
        blockedRe: /from `user`.*for update/i,
      });
      expect(overlapped).toBe(true);

      const rows = await subscriptions(user);
      const month = rows.find(r => r.subscribe_card_key === "month");
      const plusRows = rows.filter(r => r.subscribe_card_key === "month_plus");

      // 月卡只會被折算一次：釋放鎖後第一筆兌換把月卡 end_at 設為 now 並建立 Plus；
      // 第二筆兌換重讀到「月卡已經 end_at=now（非有效）」，不會再折算一次，
      // 改為對同一張 Plus 做普通延長（cardKey===month_plus 的 existing row 續期）。
      expect(plusRows).toHaveLength(1);
      // Plus 應該疊加了「30 天卡片本身 ×2 次兌換」+「一次月卡折算 10 天×1/2=5 天」= 65 天。
      expectWithin(plusRows[0].end_at, ms(plusRows[0].start_at) + 65 * DAY_MS, 3000);

      // 月卡被折算後立刻結束，且不會因為第二筆兌換又被動一次（沒有「有效月卡」可以再折算）。
      expect(ms(month.end_at)).toBeLessThanOrEqual(Date.now() + 1000);

      const conversions = [c1, c2].filter(c =>
        repliesOf(c).includes("message.subscribe.conversion_absorbs_other")
      );
      expect(conversions).toHaveLength(1); // 只有一筆真的觸發折算文案
    });

    it("持有有效 Plus 時，同時兌換兩張月卡序號：兩筆都折算進同一張 Plus，累加不遺失", async () => {
      const user = LINE("9");
      await seedLineUser(user);
      const plusEnd = new Date(Date.now() + 20 * DAY_MS);
      await mysql("subscribe_user").insert({
        user_id: user,
        subscribe_card_key: "month_plus",
        start_at: new Date(Date.now() - 5 * DAY_MS),
        end_at: plusEnd,
      });
      const [s1, s2] = [await seedCoupon("month"), await seedCoupon("month")];
      const c1 = ctx(user);
      const c2 = ctx(user);

      const overlapped = await runOverlapped({
        lockFn: holder => holder("user").where({ platform_id: user }).forUpdate().first("id"),
        start: () => Promise.all([callExchange(c1, s1), callExchange(c2, s2)]),
        blockedRe: /from `user`.*for update/i,
      });
      expect(overlapped).toBe(true);

      const rows = await subscriptions(user);
      // 兩張月卡序號都不建立自己的列，只有原本那張 Plus。
      expect(rows).toHaveLength(1);
      expect(rows[0].subscribe_card_key).toBe("month_plus");
      // 兩次折算應該都疊加：20 天(原本) + 15 天 + 15 天 = 50 天，不會因並發而遺失其中一筆。
      expectWithin(rows[0].end_at, ms(plusEnd) + 30 * DAY_MS, 3000);

      for (const c of [c1, c2]) {
        expect(repliesOf(c)).toContain("message.subscribe.conversion_absorbed_by_plus");
      }
    });
  });
});
