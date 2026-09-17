// U5 / KTD9：legacy Redis queue 只做 LRANGE 全量 archive，不 pop；DB 僅隨機測試庫。
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

const testDatabase = createWorldBossTestDatabase("dq_archive");
if (!/^Princess_wbtest_dq_archive_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../src/util/mysql", () => mysql);
jest.mock("config", () => ({
  get: jest.fn(key =>
    key === "event_center.daily_quest" ? "event_center:daily_quest" : undefined
  ),
}));

const redis = require("../../src/util/redis");
const { DefaultLogger } = require("../../src/util/Logger");
const Archive = require("../DailyQuestQueueArchive");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
const D_C = "2026-09-07";
const at = date => new Date(`${date}T12:00:00+08:00`);
let seq = 0;

async function seedEligible(userId) {
  seq += 1;
  const matchId = `u5-archive-${seq}`;
  await mysql("signin_ledger").insert({
    user_id: userId,
    signin_date: D_C,
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
    created_at: at(D_C),
    updated_at: at(D_C),
  });
}

describe("DailyQuestQueueArchive (isolated DB + mock Redis)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_dq_archive_/);
    expect(databaseName).not.toBe("Princess");
    expect(jest.isMockFunction(redis.lRange)).toBe(true);
  }, SETUP_TIMEOUT_MS);

  afterAll(() => testDatabase.teardown());

  beforeEach(async () => {
    seq = 0;
    jest.clearAllMocks();
    await mysql("daily_quest_legacy_queue_archive").del();
    await mysql("daily_quest_bridge_state").del();
    await mysql("daily_quest").del();
    await mysql("signin_ledger").del();
    await mysql("janken_result").del();
    await mysql("janken_records").del();
    await mysql("daily_quest_bridge_state").insert({ id: 1, since_date: D_C });
  });

  test("LRANGE raw 全量原樣保存、不 pop、不 log payload，四類含 unknown 保留", async () => {
    const paid = U("a");
    const eligible = U("b");
    const notEligible = U("c");
    const partial = U("d");
    const raws = [
      JSON.stringify({ userId: paid }),
      JSON.stringify({ userId: eligible }),
      JSON.stringify({ userId: notEligible }),
      JSON.stringify({ userId: partial }),
      "malformed-raw",
    ];
    await mysql("daily_quest").insert({
      user_id: paid,
      created_at: at(D_C),
      updated_at: at(D_C),
    });
    await seedEligible(eligible);
    await mysql("signin_ledger").insert({
      user_id: partial,
      signin_date: D_C,
      source: "normal",
      cost_stones: 0,
    });
    redis.lRange.mockResolvedValueOnce(raws);

    const result = await Archive.main({ capturedAt: at("2026-09-08") });

    expect(redis.lRange).toHaveBeenCalledWith("event_center:daily_quest", 0, -1);
    expect(redis.rPop).not.toHaveBeenCalled();
    expect(redis.lTrim).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
    const archived = await mysql("daily_quest_legacy_queue_archive").orderBy("id");
    expect(archived.map(row => row.raw)).toEqual(raws);
    expect(result).toMatchObject({
      archived: 5,
      counts: { legacyPaid: 1, scannerWillPay: 1, notEligible: 1, unknown: 2 },
      unknownIndexes: [3, 4],
      classifications: [
        { index: 0, classification: "legacyPaid" },
        { index: 1, classification: "scannerWillPay" },
        { index: 2, classification: "notEligible" },
        { index: 3, classification: "unknown" },
        { index: 4, classification: "unknown" },
      ],
    });
    const logs = [DefaultLogger.info, DefaultLogger.warn, DefaultLogger.error]
      .flatMap(logger => logger.mock.calls.flat())
      .join(" ");
    for (const raw of raws) expect(logs).not.toContain(raw);
    for (const userId of [paid, eligible, notEligible, partial]) {
      expect(logs).not.toContain(userId);
    }
  });

  test("require 工具本身不會讀 queue 或寫 archive", () => {
    expect(redis.lRange).not.toHaveBeenCalled();
    expect(mysql("daily_quest_legacy_queue_archive")).toBeDefined();
  });

  test("已 activation 後拒絕 archive，且不讀 queue", async () => {
    await mysql("daily_quest_bridge_state").where({ id: 1 }).update({ activated_at: new Date() });

    await expect(Archive.main()).rejects.toMatchObject({ code: "BRIDGE_ALREADY_ACTIVATED" });
    expect(redis.lRange).not.toHaveBeenCalled();
    expect(await mysql("daily_quest_legacy_queue_archive")).toHaveLength(0);
  });
});
