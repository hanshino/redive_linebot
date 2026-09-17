// U9(a)：bin → U3 service 的隔離 MySQL 證據。只使用 Princess_wbtest_auto_janken_bin_*。
// Redis 是 Jest 全域 mock；不啟動真 scheduler/worker/server，不 monkeypatch mysql.transaction。
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

const testDatabase = createWorldBossTestDatabase("auto_janken_bin");
if (!/^Princess_wbtest_auto_janken_bin_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../src/util/mysql", () => mysql);

// Runtime service/bin load only after guard + isolated mysql mock.
const { getClient } = require("bottender");
const redis = require("../../src/util/redis");
const Service = require("../../src/service/JankenAutoMatchmakingService");
const runSpy = jest.spyOn(Service, "runDailyAutoMatch");
const AutoJankenMatchmaking = require("../AutoJankenMatchmaking");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
const USERS = [U("a"), U("b"), U("c"), U("d")];
const ACTIVE_START = new Date("2029-01-01T00:00:00.000Z");
const ACTIVE_END = new Date("2031-01-01T00:00:00.000Z");
const atTaipei = (date, time) => new Date(`${date}T${time}+08:00`);

async function seedUser(userId) {
  await mysql("user").insert({ platform: "line", platform_id: userId });
  await mysql("subscribe_user").insert({
    user_id: userId,
    subscribe_card_key: "month_plus",
    start_at: ACTIVE_START,
    end_at: ACTIVE_END,
  });
  await mysql("user_auto_preference").insert({
    user_id: userId,
    auto_match_enabled: 1,
    auto_match_generation: 1,
    auto_match_bet_enabled: 0,
    auto_match_bet_generation: 0,
    auto_match_bet_cap: 0,
  });
}

describe("AutoJankenMatchmaking bin (isolated DB)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_auto_janken_bin_/);
    expect(databaseName).not.toBe("Princess");
    for (const userId of USERS) await seedUser(userId);
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    runSpy.mockRestore();
    await testDatabase.teardown();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await mysql("janken_auto_match_outbox").del();
    await mysql("janken_result").del();
    await mysql("janken_records").del();
    await mysql("janken_auto_match_participant").del();
    await mysql("janken_auto_match_run").del();
  });

  test("require bin 不自動執行", () => {
    expect(runSpy).not.toHaveBeenCalled();
  });

  test("21:00 minute 外不補跑、不建立 claim", async () => {
    for (const [date, time] of [
      ["2030-01-01", "20:59:59"],
      ["2030-01-05", "21:01:00"],
    ]) {
      const result = await AutoJankenMatchmaking.main({ now: atTaipei(date, time) });
      expect(result).toMatchObject({
        claimed: false,
        skipped: true,
        reason: "outside_schedule_window",
        runDate: date,
        results: [],
      });
    }
    expect(runSpy).not.toHaveBeenCalled();
    expect(await mysql("janken_auto_match_run")).toHaveLength(0);
  });

  test("兩個 bin worker 同日同時啟動：只有一個 claim，結算只一次；restart 不二扣/不重打", async () => {
    const now = atTaipei("2030-01-02", "21:00:00");
    const clock = jest.fn(() => now);
    const lineCallsBefore = getClient.mock.calls.length;

    const results = await Promise.all([
      AutoJankenMatchmaking.main({ now, clock, rng: () => 0 }),
      AutoJankenMatchmaking.main({ now, clock, rng: () => 0 }),
    ]);

    expect(results.filter(result => result.claimed)).toHaveLength(1);
    expect(results.filter(result => !result.claimed)).toHaveLength(1);
    expect(await mysql("janken_auto_match_run").where({ run_date: "2030-01-02" })).toHaveLength(1);
    expect(
      await mysql("janken_auto_match_participant").where({ run_date: "2030-01-02" })
    ).toHaveLength(4);
    expect(
      await mysql("janken_auto_match_participant").where({
        run_date: "2030-01-02",
        status: "completed",
      })
    ).toHaveLength(4);
    expect(await mysql("janken_records").where({ source: "auto" })).toHaveLength(2);
    expect(await mysql("janken_result")).toHaveLength(4);
    expect(clock).toHaveBeenCalledTimes(2);
    expect(getClient.mock.calls.length).toBe(lineCallsBefore);
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
    expect(redis.zAdd).not.toHaveBeenCalled();
    expect(redis.lPush).not.toHaveBeenCalled();

    const before = {
      records: (await mysql("janken_records")).length,
      results: (await mysql("janken_result")).length,
      inventory: (await mysql("inventory")).length,
    };
    const restart = await AutoJankenMatchmaking.main({ now, clock, rng: () => 0 });
    expect(restart).toMatchObject({ claimed: false, results: [] });
    expect((await mysql("janken_records")).length).toBe(before.records);
    expect((await mysql("janken_result")).length).toBe(before.results);
    expect((await mysql("inventory")).length).toBe(before.inventory);
  });

  test("批次部分失敗：已完成場保留、另一場 failed，不整批 rollback 或重打", async () => {
    const now = atTaipei("2030-01-03", "21:00:00");
    const expired = atTaipei("2032-01-01", "21:00:00");
    const clock = jest.fn().mockReturnValueOnce(now).mockReturnValueOnce(expired);

    const result = await AutoJankenMatchmaking.main({ now, clock, rng: () => 0 });

    expect(result.claimed).toBe(true);
    expect(result.results.map(item => item.status).sort()).toEqual(["completed", "failed"]);
    expect(
      await mysql("janken_auto_match_participant").where({
        run_date: "2030-01-03",
        status: "completed",
      })
    ).toHaveLength(2);
    expect(
      await mysql("janken_auto_match_participant").where({
        run_date: "2030-01-03",
        status: "failed",
      })
    ).toHaveLength(2);
    expect(await mysql("janken_records").where({ source: "auto" })).toHaveLength(1);

    const restart = await AutoJankenMatchmaking.main({ now, clock: () => now, rng: () => 0 });
    expect(restart).toMatchObject({ claimed: false, results: [] });
    expect(
      await mysql("janken_auto_match_participant").where({
        run_date: "2030-01-03",
        status: "failed",
      })
    ).toHaveLength(2);
  });

  test("hard-crash manifest 留 not_started；bin restart 因既有 claim 不補打", async () => {
    const now = atTaipei("2030-01-04", "21:00:00");
    const manifest = await Service.createDailyManifest({
      runDate: "2030-01-04",
      now,
      rng: () => 0,
    });
    expect(manifest.claimed).toBe(true);
    expect(
      await mysql("janken_auto_match_participant").where({
        run_date: "2030-01-04",
        status: "not_started",
      })
    ).toHaveLength(4);

    const restart = await AutoJankenMatchmaking.main({ now, clock: () => now, rng: () => 0 });

    expect(restart).toMatchObject({ claimed: false, results: [] });
    expect(
      await mysql("janken_auto_match_participant").where({
        run_date: "2030-01-04",
        status: "not_started",
      })
    ).toHaveLength(4);
    expect(
      await mysql("janken_records").whereIn(
        "id",
        manifest.matches.map(match => match.matchId)
      )
    ).toHaveLength(0);
  });
});
