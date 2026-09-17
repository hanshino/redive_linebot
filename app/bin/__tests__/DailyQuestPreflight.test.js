// U5 / KTD9：preflight 只讀檢查；DB 僅隨機 Princess_wbtest_dq_preflight_*。
const { execFileSync } = require("child_process");

process.env.DOTENV_CONFIG_QUIET = "true";
process.env.SUPPRESS_NO_CONFIG_WARNING = "true";

const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../src/__tests__/helpers/worldBossFixture");

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

const testDatabase = createWorldBossTestDatabase("dq_preflight");
if (!/^Princess_wbtest_dq_preflight_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../src/util/mysql", () => mysql);
jest.mock("config", () => ({ get: jest.fn() }));

const moment = require("moment");
const { todayUtc8 } = require("../../src/util/date");
const Preflight = require("../DailyQuestPreflight");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
const TODAY = todayUtc8();
const todayMoment = moment.utc(TODAY, "YYYY-MM-DD");
const WEEK_START = todayMoment.clone().subtract(todayMoment.day(), "days").format("YYYY-MM-DD");
const D_C = moment(WEEK_START, "YYYY-MM-DD").add(1, "day").format("YYYY-MM-DD");
const addDays = (date, days) => moment(date, "YYYY-MM-DD").add(days, "days").format("YYYY-MM-DD");
const at = date => new Date(`${date}T12:00:00+08:00`);
let seq = 0;

async function seedState() {
  await mysql("daily_quest_bridge_state").insert({ id: 1, since_date: D_C });
}

async function seedSources(userId, date) {
  seq += 1;
  const matchId = `u5-preflight-${seq}`;
  await mysql("signin_ledger").insert({
    user_id: userId,
    signin_date: date,
    source: "normal",
    cost_stones: 0,
  });
  await mysql("janken_records").insert({
    id: matchId,
    user_id: userId,
    target_user_id: U("z"),
    source: "manual",
  });
  await mysql("janken_result").insert({
    record_id: matchId,
    user_id: userId,
    result: 1,
    created_at: at(date),
    updated_at: at(date),
  });
}

async function legacyRow(userId, date) {
  await mysql("daily_quest").insert({
    user_id: userId,
    created_at: at(date),
    updated_at: at(date),
  });
}

describe("DailyQuestPreflight (isolated DB, read-only checks)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_dq_preflight_/);
    expect(databaseName).not.toBe("Princess");
  }, SETUP_TIMEOUT_MS);

  afterAll(() => testDatabase.teardown());

  beforeEach(async () => {
    seq = 0;
    await mysql("daily_quest_bridge_state").del();
    await mysql("daily_quest").del();
    await mysql("signin_ledger").del();
    await mysql("janken_result").del();
    await mysql("janken_records").del();
    await seedState();
  });

  test("同 user 同日 legacy duplicate 必須 STOP", async () => {
    const userId = U("a");
    await seedSources(userId, D_C);
    await legacyRow(userId, D_C);
    await legacyRow(userId, D_C);

    const result = await Preflight.inspect({ manualAuditReference: "synthetic-audit" });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LEGACY_DUPLICATE_DATE" })])
    );
    await expect(Preflight({ manualAuditReference: "synthetic-audit" })).rejects.toMatchObject({
      code: "DAILY_QUEST_PREFLIGHT_FAILED",
    });
  });

  test("W0 單一 user 有 >=7 個不同 legacy 日期必須 STOP", async () => {
    const userId = U("b");
    for (let i = 0; i < 7; i += 1) {
      const date = addDays(WEEK_START, i);
      await seedSources(userId, date);
      await legacyRow(userId, date);
    }

    const result = await Preflight.inspect({ manualAuditReference: "synthetic-audit" });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LEGACY_WEEK_COUNT_GE_7" })])
    );
  });

  test("session TZ 不為 +08:00 必須 STOP", async () => {
    const trx = await mysql.transaction();
    try {
      await trx.raw("SET time_zone = '+00:00'");
      const result = await Preflight.inspect({
        db: trx,
        manualAuditReference: "synthetic-audit",
      });
      expect(result.ok).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "SESSION_TIME_ZONE_MISMATCH" })])
      );
    } finally {
      await trx.raw("SET time_zone = '+08:00'");
      await trx.rollback();
    }
  });

  test("runtime today 與 DB CURDATE 不同必須 STOP", async () => {
    const trx = await mysql.transaction();
    try {
      await trx.raw("SET time_zone = '+08:00'");
      await trx.raw("SET timestamp = UNIX_TIMESTAMP(?)", [`${D_C} 12:00:00`]);
      const result = await Preflight.inspect({
        db: trx,
        manualAuditReference: "synthetic-audit",
        runtimeDate: addDays(D_C, -1),
      });

      expect(result.ok).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "RUNTIME_DB_DATE_MISMATCH" })])
      );
    } finally {
      await trx.raw("SET timestamp = DEFAULT");
      await trx.rollback();
    }
  });

  test("legacy 列缺任一 durable source 對應必須 STOP", async () => {
    await legacyRow(U("c"), D_C);

    const result = await Preflight.inspect({ manualAuditReference: "synthetic-audit" });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LEGACY_SOURCE_MISMATCH" })])
    );
  });

  test("沒有人工改刪確認來源時不可假設安全，必須 STOP", async () => {
    const result = await Preflight.inspect({ manualAuditReference: "" });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MANUAL_AUDIT_UNCONFIRMED" })])
    );
  });

  test("已 activation 後不得再把 preflight 當 release gate", async () => {
    await mysql("daily_quest_bridge_state").where({ id: 1 }).update({ activated_at: new Date() });

    const result = await Preflight.inspect({ manualAuditReference: "synthetic-audit" });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "ALREADY_ACTIVATED" })])
    );
  });

  test("weekday D_c、TZ/runtime/source/人工 audit 全吻合時通過", async () => {
    const userId = U("d");
    await seedSources(userId, D_C);
    await legacyRow(userId, D_C);
    const before = {
      quests: Number((await mysql("daily_quest").count({ count: "*" }).first()).count),
      signins: Number((await mysql("signin_ledger").count({ count: "*" }).first()).count),
      results: Number((await mysql("janken_result").count({ count: "*" }).first()).count),
    };
    const trx = await mysql.transaction();
    try {
      await trx.raw("SET time_zone = '+08:00'");
      await trx.raw("SET timestamp = UNIX_TIMESTAMP(?)", [`${D_C} 12:00:00`]);
      const result = await Preflight.inspect({
        db: trx,
        runtimeDate: D_C,
        manualAuditReference: "synthetic-audit",
      });
      expect(result).toMatchObject({
        ok: true,
        sinceDate: D_C,
        manualAuditReference: "synthetic-audit",
        issues: [],
      });
    } finally {
      await trx.raw("SET timestamp = DEFAULT");
      await trx.rollback();
    }
    const after = {
      quests: Number((await mysql("daily_quest").count({ count: "*" }).first()).count),
      signins: Number((await mysql("signin_ledger").count({ count: "*" }).first()).count),
      results: Number((await mysql("janken_result").count({ count: "*" }).first()).count),
    };
    expect(after).toEqual(before);
  });
});
