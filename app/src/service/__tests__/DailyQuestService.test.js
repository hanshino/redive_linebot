// U5 / KTD5：durable DailyQuest scanner 的真實 MySQL 交易、跨日與 mutex 證據。
// DB 只使用隨機 Princess_wbtest_daily_quest_*；Redis 維持 Jest mock，scanner 不讀它。
const { execFileSync } = require("child_process");

process.env.DOTENV_CONFIG_QUIET = "true";
process.env.SUPPRESS_NO_CONFIG_WARNING = "true";

const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../__tests__/helpers/worldBossFixture");

function assertIsolatedLocalMysql() {
  if (!["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
    throw new Error(`refuse: DB_HOST is not local (${process.env.DB_HOST})`);
  }
  const port = process.env.DB_PORT || "3306";
  const names = execFileSync(
    "docker",
    ["ps", "--filter", `publish=${port}`, "--format", "{{.Names}}"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  ).trim();
  if (!names) throw new Error(`refuse: no local Docker MySQL publishes port ${port}`);
}
assertIsolatedLocalMysql();

const testDatabase = createWorldBossTestDatabase("daily_quest");
if (!/^Princess_wbtest_daily_quest_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);
jest.mock("config", () => ({
  get: jest.fn(key => {
    const values = {
      "daily_quest.reward.itemId": 999,
      "daily_quest.reward.itemAmount": 150,
      "daily_quest.weekly_reward.itemId": 999,
      "daily_quest.weekly_reward.itemAmount": 500,
    };
    return values[key];
  }),
}));

// Runtime modules must load only after the local guard and isolated mysql mock.
const moment = require("moment");
const config = require("config");
const AchievementEngine = require("../AchievementEngine");
const DailyQuest = require("../../model/application/DailyQuest");
const Service = require("../DailyQuestService");
const DailyQuestProcess = require("../../../bin/DailyQuestProcess");
const redis = require("../../util/redis");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
const D_C = "2026-09-07"; // Monday; W0 starts Sunday 2026-09-06.
const ACTIVE_AT = new Date("2026-09-07T02:00:00.000Z");
const dateAt = (date, time = "12:00:00") => new Date(`${date}T${time}+08:00`);
const addDays = (date, days) => moment(date, "YYYY-MM-DD").add(days, "days").format("YYYY-MM-DD");

let matchSeq = 0;

async function activate(sinceDate = D_C) {
  await mysql("daily_quest_bridge_state").insert({
    id: 1,
    since_date: sinceDate,
    activated_at: ACTIVE_AT,
  });
}

function seedSignin(userId, signinDate, source = "normal", createdAt = dateAt(signinDate)) {
  return mysql("signin_ledger").insert({
    user_id: userId,
    signin_date: signinDate,
    source,
    cost_stones: source === "makeup" ? 50 : 0,
    created_at: createdAt,
  });
}

async function seedManualJanken(userId, occurredAt, source = "manual") {
  matchSeq += 1;
  const matchId = `u5-manual-${matchSeq}`;
  await mysql("janken_records").insert({
    id: matchId,
    user_id: userId,
    target_user_id: U("z"),
    source,
  });
  await mysql("janken_result").insert({
    record_id: matchId,
    user_id: userId,
    result: 1,
    created_at: occurredAt,
    updated_at: occurredAt,
  });
  return matchId;
}

async function seedAutoJanken(userId, runDate, committedAt) {
  matchSeq += 1;
  const matchId = `u5-auto-${matchSeq}`;
  await mysql("janken_auto_match_run").insert({ run_date: runDate });
  await mysql("janken_auto_match_participant").insert({
    run_date: runDate,
    user_id: userId,
    match_id: matchId,
    role: "p1",
    opponent_user_id: U("y"),
    choice: "rock",
    match_generation: 1,
    bet_enabled: 0,
    bet_generation: 0,
    bet_cap: 0,
    status: "completed",
  });
  await mysql("janken_records").insert({
    id: matchId,
    user_id: userId,
    target_user_id: U("y"),
    source: "auto",
  });
  await mysql("janken_result").insert({
    record_id: matchId,
    user_id: userId,
    result: 1,
    created_at: committedAt,
    updated_at: committedAt,
  });
}

function rewardRows(userId, note) {
  return mysql("inventory").where({ userId, itemId: 999, note });
}

async function legacyQuest(userId, date) {
  const at = dateAt(date);
  await mysql("daily_quest").insert({ user_id: userId, created_at: at, updated_at: at });
}

async function datedQuest(userId, date) {
  await mysql("daily_quest").insert({ user_id: userId, quest_date: date });
}

describe("DailyQuestService (isolated DB)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_daily_quest_/);
    expect(databaseName).not.toBe("Princess");
  }, SETUP_TIMEOUT_MS);

  afterAll(() => testDatabase.teardown());

  beforeEach(async () => {
    matchSeq = 0;
    jest.clearAllMocks();
    await mysql("daily_quest_weekly_claim").del();
    await mysql("daily_quest_completion").del();
    await mysql("daily_quest_legacy_queue_archive").del();
    await mysql("daily_quest_bridge_state").del();
    await mysql("daily_quest").del();
    await mysql("inventory").del();
    await mysql("signin_ledger").del();
    await mysql("janken_result").del();
    await mysql("janken_auto_match_participant").del();
    await mysql("janken_auto_match_run").del();
    await mysql("janken_records").del();
    await mysql("achievement_user_lock").del();
  });

  test("U5 schema 欄位、PK 與 scanner 索引符合 contract", async () => {
    const primaryKey = async table => {
      const rows = await mysql("information_schema.statistics")
        .where({
          table_schema: testDatabase.databaseName,
          table_name: table,
          index_name: "PRIMARY",
        })
        .orderBy("seq_in_index")
        .select("column_name");
      return rows.map(row => row.column_name || row.COLUMN_NAME);
    };
    expect(await primaryKey("daily_quest_completion")).toEqual(["user_id", "quest_date"]);
    expect(await primaryKey("daily_quest_weekly_claim")).toEqual(["user_id", "week_start"]);
    const questDate = await mysql("information_schema.columns")
      .where({
        table_schema: testDatabase.databaseName,
        table_name: "daily_quest",
        column_name: "quest_date",
      })
      .first();
    expect(questDate.is_nullable || questDate.IS_NULLABLE).toBe("YES");
    const indexes = await mysql("information_schema.statistics")
      .where({ table_schema: testDatabase.databaseName, table_name: "janken_result" })
      .whereIn("index_name", [
        "idx_janken_result_created_id",
        "idx_janken_result_user_created_id",
        "idx_janken_result_record_user",
      ])
      .distinct("index_name");
    expect(indexes).toHaveLength(3);
  });

  test("正常簽到跨午夜 commit 仍依 signin_date 結算；makeup 不追溯", async () => {
    const normalUser = U("a");
    const makeupUser = U("b");
    await activate();
    await seedSignin(normalUser, D_C, "normal", dateAt(addDays(D_C, 1), "00:00:01"));
    await seedSignin(makeupUser, D_C, "makeup", dateAt(addDays(D_C, 1), "00:00:01"));
    await seedManualJanken(normalUser, dateAt(D_C, "23:59:59"));
    await seedManualJanken(makeupUser, dateAt(D_C, "23:59:59"));

    const result = await Service.run({ today: D_C });

    expect(result).toMatchObject({ activated: true, rewarded: 1 });
    expect(await rewardRows(normalUser, "daily_quest")).toHaveLength(1);
    expect(await rewardRows(makeupUser, "daily_quest")).toHaveLength(0);
    expect(await mysql("daily_quest_completion").where({ user_id: normalUser })).toHaveLength(1);
    expect(await mysql("daily_quest_completion").where({ user_id: makeupUser })).toHaveLength(0);
    expect(await mysql("achievement_user_lock").where({ user_id: makeupUser })).toHaveLength(0);
    expect(redis.rPop).not.toHaveBeenCalled();
    expect(redis.lRange).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  test("D_c legacy 已付只 seed completion；未付者只付一次", async () => {
    const paidUser = U("c");
    const unpaidUser = U("d");
    await activate();
    for (const userId of [paidUser, unpaidUser]) {
      await seedSignin(userId, D_C);
      await seedManualJanken(userId, dateAt(D_C));
    }
    await legacyQuest(paidUser, D_C);

    await Service.run({ today: D_C });
    await Service.run({ today: D_C });

    expect(await mysql("daily_quest_completion").where({ quest_date: D_C })).toHaveLength(2);
    expect(await rewardRows(paidUser, "daily_quest")).toHaveLength(0);
    expect(await rewardRows(unpaidUser, "daily_quest")).toHaveLength(1);
    expect(await mysql("daily_quest").where({ user_id: paidUser })).toHaveLength(1);
    expect(await mysql("daily_quest").where({ user_id: unpaidUser, quest_date: D_C })).toHaveLength(
      1
    );
  });

  test("auto 場次跨午夜 commit 仍用 immutable manifest run_date 歸原日", async () => {
    const userId = U("e");
    await activate();
    await seedSignin(userId, D_C);
    await seedAutoJanken(userId, D_C, dateAt(addDays(D_C, 1), "00:00:01"));

    await Service.run({ today: addDays(D_C, 1) });

    expect(await mysql("daily_quest_completion").where({ user_id: userId })).toMatchObject([
      expect.objectContaining({ user_id: userId }),
    ]);
    const completion = await mysql("daily_quest_completion").where({ user_id: userId }).first();
    expect(require("../../util/date").toUtc8Date(completion.quest_date)).toBe(D_C);
  });

  test("W0 第 7 日週六事件到週日才處理，仍歸原週並付款", async () => {
    const userId = U("f");
    const weekStart = "2026-09-06";
    const saturday = "2026-09-12";
    await activate();
    await legacyQuest(userId, weekStart);
    for (let i = 1; i < 6; i += 1) {
      const date = addDays(weekStart, i);
      await mysql("daily_quest_completion").insert({ user_id: userId, quest_date: date });
      await datedQuest(userId, date);
    }
    await seedSignin(userId, saturday);
    await seedManualJanken(userId, dateAt(saturday, "23:59:59"));

    await Service.run({ today: "2026-09-13" });

    expect(await rewardRows(userId, "daily_quest_weekly")).toHaveLength(1);
    const claim = await mysql("daily_quest_weekly_claim").where({ user_id: userId }).first();
    expect(require("../../util/date").toUtc8Date(claim.week_start)).toBe(weekStart);
  });

  test("W1 多日 outage 後逐日補結，各筆 completion 與 weekly 都歸原週", async () => {
    const userId = U("g");
    const weekStart = "2026-09-13";
    await activate();
    for (let i = 0; i < 7; i += 1) {
      const date = addDays(weekStart, i);
      await seedSignin(userId, date);
      await seedManualJanken(userId, dateAt(date));
    }

    await Service.run({ today: "2026-09-21" });

    expect(await mysql("daily_quest_completion").where({ user_id: userId })).toHaveLength(7);
    expect(await rewardRows(userId, "daily_quest")).toHaveLength(7);
    expect(await rewardRows(userId, "daily_quest_weekly")).toHaveLength(1);
    const claim = await mysql("daily_quest_weekly_claim").where({ user_id: userId }).first();
    expect(require("../../util/date").toUtc8Date(claim.week_start)).toBe(weekStart);
  });

  test("janken_result(created_at,id) keyset 跨過 500 列仍不漏候選 user", async () => {
    const userId = U("o");
    await activate();
    await seedSignin(userId, D_C);
    const records = [];
    const results = [];
    for (let i = 0; i < 501; i += 1) {
      const matchId = `u5-keyset-${i}`;
      records.push({ id: matchId, user_id: userId, target_user_id: U("z"), source: "manual" });
      results.push({
        record_id: matchId,
        user_id: userId,
        result: 1,
        created_at: dateAt(D_C),
        updated_at: dateAt(D_C),
      });
    }
    await mysql("janken_records").insert(records);
    await mysql("janken_result").insert(results);

    await Service.run({ today: D_C });

    expect(await rewardRows(userId, "daily_quest")).toHaveLength(1);
    expect(await mysql("daily_quest_completion").where({ user_id: userId })).toHaveLength(1);
  });

  test("第 7 日 weekly effect 失敗時 completion/mirror/daily/claim 全 rollback，可重跑", async () => {
    const userId = U("h");
    const weekStart = "2026-09-13";
    const seventh = addDays(weekStart, 6);
    await activate();
    for (let i = 0; i < 6; i += 1) {
      const date = addDays(weekStart, i);
      await mysql("daily_quest_completion").insert({ user_id: userId, quest_date: date });
      await datedQuest(userId, date);
    }
    await seedSignin(userId, seventh);
    await seedManualJanken(userId, dateAt(seventh));
    await mysql.raw(
      "ALTER TABLE inventory ADD CONSTRAINT u5_fail_weekly_reward " +
        "CHECK (note IS NULL OR note <> 'daily_quest_weekly')"
    );

    try {
      await expect(Service.settleUserDay(userId, seventh, D_C)).rejects.toBeDefined();
      expect(
        await mysql("daily_quest_completion").where({ user_id: userId, quest_date: seventh })
      ).toHaveLength(0);
      expect(
        await mysql("daily_quest").where({ user_id: userId, quest_date: seventh })
      ).toHaveLength(0);
      expect(await rewardRows(userId, "daily_quest")).toHaveLength(0);
      expect(await rewardRows(userId, "daily_quest_weekly")).toHaveLength(0);
      expect(await mysql("daily_quest_weekly_claim").where({ user_id: userId })).toHaveLength(0);
    } finally {
      await mysql.raw("ALTER TABLE inventory DROP CHECK u5_fail_weekly_reward");
    }
    await Service.settleUserDay(userId, seventh, D_C);
    expect(
      await mysql("daily_quest_completion").where({ user_id: userId, quest_date: seventh })
    ).toHaveLength(1);
    expect(await rewardRows(userId, "daily_quest")).toHaveLength(1);
    expect(await rewardRows(userId, "daily_quest_weekly")).toHaveLength(1);
  });

  test("兩真連線同 user/day 由 achievement mutex 序列化，daily/weekly 都至多一次", async () => {
    const userId = U("i");
    const weekStart = "2026-09-13";
    const seventh = addDays(weekStart, 6);
    await activate();
    for (let i = 0; i < 6; i += 1) {
      const date = addDays(weekStart, i);
      await mysql("daily_quest_completion").insert({ user_id: userId, quest_date: date });
      await datedQuest(userId, date);
    }
    await seedSignin(userId, seventh);
    await seedManualJanken(userId, dateAt(seventh));
    await AchievementEngine.ensureUserLock(userId);

    const inflight = new Map();
    const onQuery = query => query.__knexQueryUid && inflight.set(query.__knexQueryUid, query.sql);
    const onDone = (_result, query) => inflight.delete(query.__knexQueryUid);
    mysql.on("query", onQuery);
    mysql.on("query-response", onDone);
    mysql.on("query-error", onDone);
    const holder = await mysql.transaction();
    let pending;
    try {
      await holder("achievement_user_lock").where({ user_id: userId }).forUpdate().first();
      pending = Promise.all([
        Service.settleUserDay(userId, seventh, D_C),
        Service.settleUserDay(userId, seventh, D_C),
      ]);
      const deadline = Date.now() + 15000;
      while (
        Date.now() < deadline &&
        [...inflight.values()].filter(sql => /insert ignore into achievement_user_lock/i.test(sql))
          .length < 2
      ) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(
        [...inflight.values()].filter(sql => /insert ignore into achievement_user_lock/i.test(sql))
      ).toHaveLength(2);
      await holder.rollback();
      await pending;
    } finally {
      if (!holder.isCompleted()) await holder.rollback().catch(() => {});
      if (pending) await pending.catch(() => {});
      mysql.off("query", onQuery);
      mysql.off("query-response", onDone);
      mysql.off("query-error", onDone);
    }

    expect(
      await mysql("daily_quest_completion").where({ user_id: userId, quest_date: seventh })
    ).toHaveLength(1);
    expect(await rewardRows(userId, "daily_quest")).toHaveLength(1);
    expect(await rewardRows(userId, "daily_quest_weekly")).toHaveLength(1);
    expect(await mysql("daily_quest_weekly_claim").where({ user_id: userId })).toHaveLength(1);
  });

  test("activated_at NULL 完全不付款；重啟永遠重讀固定 since_date", async () => {
    const beforeSince = U("j");
    const atSince = U("k");
    const later = U("l");
    await mysql("daily_quest_bridge_state").insert({ id: 1, since_date: D_C, activated_at: null });
    for (const [userId, date] of [
      [beforeSince, addDays(D_C, -1)],
      [atSince, D_C],
      [later, addDays(D_C, 2)],
    ]) {
      await seedSignin(userId, date);
      await seedManualJanken(userId, dateAt(date));
    }

    await expect(Service.run({ today: addDays(D_C, 2) })).resolves.toMatchObject({
      activated: false,
      rewarded: 0,
    });
    expect(await mysql("inventory")).toHaveLength(0);
    await mysql("daily_quest_bridge_state").where({ id: 1 }).update({ activated_at: ACTIVE_AT });

    await Service.run({ today: D_C });
    await Service.run({ today: addDays(D_C, 2) });

    expect(await rewardRows(beforeSince, "daily_quest")).toHaveLength(0);
    expect(await rewardRows(atSince, "daily_quest")).toHaveLength(1);
    expect(await rewardRows(later, "daily_quest")).toHaveLength(1);
    const state = await mysql("daily_quest_bridge_state").where({ id: 1 }).first();
    expect(require("../../util/date").toUtc8Date(state.since_date)).toBe(D_C);
  });

  test("DailyQuestProcess require 無副作用，activated_at NULL 時不讀 Redis、不寫 reward", async () => {
    const userId = U("n");
    await mysql("daily_quest_bridge_state").insert({ id: 1, since_date: D_C, activated_at: null });
    await seedSignin(userId, D_C);
    await seedManualJanken(userId, dateAt(D_C));

    expect(redis.rPop).not.toHaveBeenCalled();
    await expect(DailyQuestProcess()).resolves.toMatchObject({ activated: false, rewarded: 0 });
    expect(redis.rPop).not.toHaveBeenCalled();
    expect(redis.lRange).not.toHaveBeenCalled();
    expect(await mysql("inventory")).toHaveLength(0);
    expect(await mysql("daily_quest_completion")).toHaveLength(0);
  });

  test("DailyQuest model 以 COALESCE(quest_date, DATE(created_at)) 同時保留舊列與新列", async () => {
    const userId = U("m");
    await legacyQuest(userId, "2026-09-13");
    await datedQuest(userId, "2026-09-14");
    // 新列 created_at 在另一週也必須以 quest_date 為準。
    await mysql("daily_quest")
      .where({ user_id: userId, quest_date: "2026-09-14" })
      .update({ created_at: dateAt("2026-10-01"), updated_at: dateAt("2026-10-01") });

    const rows = await DailyQuest.all(userId, {
      filter: {
        createdAt: { start: dateAt("2026-09-13", "00:00:00"), end: dateAt("2026-09-19") },
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows.some(row => row.quest_date === null)).toBe(true);
    expect(rows.some(row => row.quest_date !== null)).toBe(true);
    expect(config.get("daily_quest.reward.itemAmount")).toBeGreaterThan(0);
  });
});
