// U4 / KTD4：outbox consumer 的真實 MySQL 交易、SKIP LOCKED 與 strict core 證據。
// DB 只使用隨機 Princess_wbtest_ajm_consumer_*；Redis 只有 Jest mock GET。
const { execFileSync } = require("child_process");

process.env.DOTENV_CONFIG_QUIET = "true";

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

const testDatabase = createWorldBossTestDatabase("ajm_consumer");
if (!/^Princess_wbtest_ajm_consumer_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);

// Runtime modules are deliberately required only after the local guard and mysql mock above.
const redis = require("../../util/redis");
const { getClient } = require("bottender");
const { DefaultLogger } = require("../../util/Logger");
const AchievementEngine = require("../AchievementEngine");
const Outbox = require("../../model/application/JankenAutoMatchOutbox");
const Service = require("../JankenAutoMatchOutboxService");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
const RUN_DATE = "2026-09-12";
const OCCURRED_AT = new Date("2026-09-12T13:00:05.000Z");
const NEXT_DAY = new Date("2026-09-13T13:00:00.000Z");
let winAchievement;
let challengeAchievement;
let trackedAchievement;

function definition(row, overrides = {}) {
  return {
    id: row.id,
    key: row.key,
    type: "milestone",
    target_value: 99,
    reward_stones: 0,
    condition: null,
    ...overrides,
  };
}

function event(matchId, role, eventName, userId, payload = {}) {
  return {
    match_id: matchId,
    role,
    event_name: eventName,
    run_date: RUN_DATE,
    user_id: userId,
    payload,
    occurred_at: OCCURRED_AT,
  };
}

function progress(userId, achievementId) {
  return mysql("user_achievement_progress")
    .where({ user_id: userId, achievement_id: achievementId })
    .first();
}

function parseLastError(row) {
  return typeof row.last_error === "string" ? JSON.parse(row.last_error) : row.last_error;
}

async function outboxRow(matchId, eventName = "janken_win") {
  return mysql("janken_auto_match_outbox")
    .where({ match_id: matchId, event_name: eventName })
    .first();
}

describe("JankenAutoMatchOutboxService (isolated DB + mock Redis)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_ajm_consumer_/);
    expect(databaseName).not.toBe("Princess");
    [winAchievement, challengeAchievement, trackedAchievement] = await Promise.all([
      mysql("achievements").where({ key: "janken_win_50" }).first(),
      mysql("achievements").where({ key: "janken_challenged_10" }).first(),
      mysql("achievements").where({ key: "social_all_features" }).first(),
    ]);
    expect(winAchievement).toBeDefined();
    expect(challengeAchievement).toBeDefined();
    expect(trackedAchievement).toBeDefined();
    expect(jest.isMockFunction(redis.get)).toBe(true);
  }, SETUP_TIMEOUT_MS);

  afterAll(() => testDatabase.teardown());

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    await mysql("achievement_tracked_item").del();
    await mysql("achievement_tracked_migration").del();
    await mysql("user_achievements").del();
    await mysql("user_achievement_progress").del();
    await mysql("inventory").del();
    await mysql("janken_auto_match_outbox").del();
    await mysql("achievement_user_lock").del();
  });

  test("兩個真連線 worker 同列：SKIP LOCKED，不重複套用 effect", async () => {
    const userId = U("a");
    AchievementEngine._setCache([definition(winAchievement)]);
    await Outbox.insertEvents([
      event("same-row", "p1", "janken_win", userId, { streak: 1, feature: "janken" }),
    ]);

    const realCore = AchievementEngine.evaluateInTransaction;
    let releaseCore;
    let signalEntered;
    const entered = new Promise(resolve => {
      signalEntered = resolve;
    });
    const held = new Promise(resolve => {
      releaseCore = resolve;
    });
    jest.spyOn(AchievementEngine, "evaluateInTransaction").mockImplementation(async (...args) => {
      const result = await realCore(...args);
      signalEntered();
      await held;
      return result;
    });

    const firstWorker = Service.processNext({ now: NEXT_DAY });
    await entered;
    const secondResult = await Service.processNext({ now: NEXT_DAY });
    releaseCore();
    const firstResult = await firstWorker;

    expect(firstResult).toMatchObject({ status: "processed" });
    expect(secondResult).toBeNull();
    expect(await progress(userId, winAchievement.id)).toMatchObject({ current_value: 1 });
    expect(await outboxRow("same-row")).toMatchObject({ attempts: 0 });
    expect((await outboxRow("same-row")).processed_at).not.toBeNull();
  });

  test("候選列被鎖時 SKIP LOCKED 後繼續處理另一列", async () => {
    const lockedUser = U("b");
    const freeUser = U("c");
    AchievementEngine._setCache([definition(winAchievement)]);
    await Outbox.insertEvents([
      event("locked-first", "p1", "janken_win", lockedUser, { streak: 1 }),
      event("free-second", "p1", "janken_win", freeUser, { streak: 1 }),
    ]);
    const locked = await outboxRow("locked-first");
    const holder = await mysql.transaction();
    try {
      await holder("janken_auto_match_outbox").where({ id: locked.id }).forUpdate().first();
      await expect(Service.processNext({ now: NEXT_DAY })).resolves.toMatchObject({
        status: "processed",
        matchId: "free-second",
      });
      expect((await outboxRow("locked-first")).processed_at).toBeNull();
      expect((await outboxRow("free-second")).processed_at).not.toBeNull();
    } finally {
      await holder.rollback();
    }
  });

  test("effect throw：整筆 rollback、attempts +1、持久 backoff 後可 retry", async () => {
    const userId = U("d");
    AchievementEngine._setCache([
      definition(winAchievement, { target_value: 1, reward_stones: 2147483648 }),
    ]);
    await Outbox.insertEvents([
      event("retryable", "p1", "janken_win", userId, { streak: 1, feature: "janken" }),
    ]);

    await expect(Service.processNext({ now: NEXT_DAY, baseBackoffMs: 1000 })).rejects.toBeDefined();
    const failed = await outboxRow("retryable");
    expect(failed).toMatchObject({ attempts: 1, processed_at: null });
    expect(parseLastError(failed)).toMatchObject({ code: expect.any(String) });
    expect(parseLastError(failed).retry_at_ms).toBe(NEXT_DAY.getTime() + 1000);
    expect(new Date(failed.occurred_at).getTime()).toBe(OCCURRED_AT.getTime());
    expect(await progress(userId, winAchievement.id)).toBeUndefined();
    const warning = DefaultLogger.warn.mock.calls[0][0];
    expect(warning).toMatch(/^\[JankenAutoMatchOutbox\] id=\d+ code=[A-Z_]+$/);
    expect(warning).not.toContain(userId);
    expect(warning).not.toContain("streak");
    expect(warning).not.toContain("janken");

    await expect(Service.processNext({ now: NEXT_DAY, baseBackoffMs: 1000 })).resolves.toBeNull();
    AchievementEngine._setCache([definition(winAchievement)]);
    await expect(
      Service.processNext({ now: new Date(NEXT_DAY.getTime() + 1001), baseBackoffMs: 1000 })
    ).resolves.toMatchObject({ status: "processed" });
    expect(await progress(userId, winAchievement.id)).toMatchObject({ current_value: 1 });
    expect((await outboxRow("retryable")).processed_at).not.toBeNull();
  });

  test("p2 勝出雙事件可各自消費，不撞 unique key", async () => {
    const userId = U("e");
    AchievementEngine._setCache([definition(winAchievement), definition(challengeAchievement)]);
    await Outbox.insertEvents([
      event("p2-dual", "p2", "janken_win", userId, { streak: 2, feature: "janken" }),
      event("p2-dual", "p2", "janken_challenge", userId, { feature: "janken" }),
    ]);

    await expect(Service.drain({ limit: 2, now: NEXT_DAY })).resolves.toMatchObject({
      processed: 2,
      failed: 0,
    });
    expect(await progress(userId, winAchievement.id)).toMatchObject({ current_value: 1 });
    expect(await progress(userId, challengeAchievement.id)).toMatchObject({ current_value: 1 });
    expect(
      await mysql("janken_auto_match_outbox")
        .where({ match_id: "p2-dual" })
        .whereNotNull("processed_at")
    ).toHaveLength(2);
  });

  test("跨日 drain 的 ctx 保留原 run_date / occurred_at，不使用處理時間", async () => {
    const userId = U("f");
    AchievementEngine._setCache([definition(winAchievement)]);
    await Outbox.insertEvents([
      event("cross-day", "p1", "janken_win", userId, { streak: 3, feature: "janken" }),
    ]);
    const realCore = AchievementEngine.evaluateInTransaction;
    let capturedContext;
    jest
      .spyOn(AchievementEngine, "evaluateInTransaction")
      .mockImplementation(async (trx, id, eventName, context) => {
        capturedContext = context;
        return realCore(trx, id, eventName, context);
      });

    await Service.processNext({ now: NEXT_DAY });

    expect(capturedContext).toMatchObject({
      streak: 3,
      feature: "janken",
      date: RUN_DATE,
    });
    expect(capturedContext.occurredAt).toBeInstanceOf(Date);
    expect(capturedContext.occurredAt.getTime()).toBe(OCCURRED_AT.getTime());
    expect(capturedContext.occurredAt.getTime()).not.toBe(NEXT_DAY.getTime());
    expect(new Date((await outboxRow("cross-day")).occurred_at).getTime()).toBe(
      OCCURRED_AT.getTime()
    );
  });

  test("事件原日早於 availableFrom：outbox processed，但不寫 progress/unlock/reward；生效日事件正常生效", async () => {
    const beforeUser = U("o");
    const boundaryUser = U("p");
    const eventDate = "2000-01-01";
    const availableFrom = "2000-01-02";
    const drainTime = new Date("2000-01-02T13:00:00.000Z");
    AchievementEngine._setCache([
      definition(winAchievement, {
        target_value: 1,
        reward_stones: 7,
        condition: { availableFrom },
      }),
    ]);
    await Outbox.insertEvents([
      {
        ...event("before-available", "p1", "janken_win", beforeUser, {
          streak: 1,
          feature: "janken",
        }),
        run_date: eventDate,
        occurred_at: new Date("2000-01-01T13:00:00.000Z"),
      },
      {
        ...event("on-boundary", "p1", "janken_win", boundaryUser, {
          streak: 1,
          feature: "janken",
        }),
        run_date: availableFrom,
        occurred_at: new Date("2000-01-02T13:00:00.000Z"),
      },
    ]);

    await Service.drain({ limit: 2, now: drainTime });

    expect((await outboxRow("before-available")).processed_at).not.toBeNull();
    expect(await progress(beforeUser, winAchievement.id)).toBeUndefined();
    expect(
      await mysql("user_achievements").where({
        user_id: beforeUser,
        achievement_id: winAchievement.id,
      })
    ).toHaveLength(0);
    expect(await mysql("inventory").where({ userId: beforeUser, note: "成就獎勵" })).toHaveLength(
      0
    );

    expect((await outboxRow("on-boundary")).processed_at).not.toBeNull();
    expect(
      await mysql("user_achievements").where({
        user_id: boundaryUser,
        achievement_id: winAchievement.id,
      })
    ).toHaveLength(1);
    expect(await mysql("inventory").where({ userId: boundaryUser, note: "成就獎勵" })).toHaveLength(
      1
    );
  });

  test("tracking_key mismatch：strict throw，列保持 pending 且 occurred_at 不變", async () => {
    const userId = U("g");
    AchievementEngine._setCache([definition(trackedAchievement)]);
    await mysql("user_achievement_progress").insert({
      user_id: userId,
      achievement_id: trackedAchievement.id,
      current_value: 4,
    });
    await mysql("achievement_tracked_migration").insert({
      user_id: userId,
      achievement_id: trackedAchievement.id,
      tracking_key: "synthetic-old-revision",
      redis_found: 0,
      item_count: 0,
      baseline_value: 4,
    });
    await Outbox.insertEvents([
      event("revision-mismatch", "p1", "janken_win", userId, { feature: "janken" }),
    ]);

    await expect(Service.processNext({ now: NEXT_DAY })).rejects.toThrow("revision mismatch");

    const row = await outboxRow("revision-mismatch");
    expect(row).toMatchObject({ attempts: 1, processed_at: null });
    expect(parseLastError(row)).toMatchObject({
      code: "ACHIEVEMENT_TRACKING_REVISION_MISMATCH",
    });
    expect(new Date(row.occurred_at).getTime()).toBe(OCCURRED_AT.getTime());
    expect(await progress(userId, trackedAchievement.id)).toMatchObject({ current_value: 4 });
    expect(await mysql("achievement_tracked_item").where({ user_id: userId })).toHaveLength(0);
    expect(redis.get).not.toHaveBeenCalled();
  });

  test("只接受兩種成就 event；無 daily_quest、無 LINE client 或通知", async () => {
    AchievementEngine._setCache([]);
    await expect(
      Outbox.insertEvents([event("bad-daily", "p1", "daily_quest", U("h"))])
    ).rejects.toMatchObject({ code: "INVALID_JANKEN_AUTO_MATCH_OUTBOX_EVENT" });
    await Outbox.insertEvents([event("no-line", "p1", "janken_win", U("i"))]);

    await Service.processNext({ now: NEXT_DAY });

    expect(
      await mysql("janken_auto_match_outbox").where({ event_name: "daily_quest" })
    ).toHaveLength(0);
    expect(getClient).not.toHaveBeenCalled();
  });

  test("bin 只匯出 cron main，require 時不直接 drain", () => {
    const drain = jest.spyOn(Service, "drain");
    const main = require("../../../bin/JankenAutoMatchOutboxDrainer");

    expect(main).toEqual(expect.any(Function));
    expect(drain).not.toHaveBeenCalled();
  });
});
