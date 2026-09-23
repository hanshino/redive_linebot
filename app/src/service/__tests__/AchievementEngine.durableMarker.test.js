// U6 / KTD7：distinct-feature Redis → durable marker 懶遷移的真實 MySQL + mock Redis 證據。
// DB 僅使用隨機 Princess_wbtest_ach_marker_*；Redis 只有 Jest mock GET，絕不碰既有 instance。
// 測試定義只使用合成 target/reward/context，不含任何未公開成就條件。
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

const testDatabase = createWorldBossTestDatabase("ach_marker");
if (!/^Princess_wbtest_ach_marker_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);

const redis = require("../../util/redis");
const AchievementEngine = require("../AchievementEngine");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
let trackedAchievement;

function trackedDefinition(overrides = {}) {
  return {
    id: trackedAchievement.id,
    key: "chat_multi_group",
    type: "social",
    target_value: 99,
    reward_stones: 0,
    condition: null,
    ...overrides,
  };
}

async function seedProgress(userId, value) {
  await mysql("user_achievement_progress").insert({
    user_id: userId,
    achievement_id: trackedAchievement.id,
    current_value: value,
  });
}

function progress(userId) {
  return mysql("user_achievement_progress")
    .where({ user_id: userId, achievement_id: trackedAchievement.id })
    .first();
}

function migration(userId) {
  return mysql("achievement_tracked_migration")
    .where({ user_id: userId, achievement_id: trackedAchievement.id })
    .first();
}

function markers(userId) {
  return mysql("achievement_tracked_item")
    .where({ user_id: userId, achievement_id: trackedAchievement.id })
    .orderBy("item_hash");
}

function unlocks(userId) {
  return mysql("user_achievements").where({
    user_id: userId,
    achievement_id: trackedAchievement.id,
  });
}

describe("AchievementEngine durable tracked marker (isolated DB + mock Redis)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_ach_marker_/);
    expect(databaseName).not.toBe("Princess");
    trackedAchievement = await mysql("achievements").where({ key: "chat_multi_group" }).first();
    expect(trackedAchievement).toBeDefined();
    expect(jest.isMockFunction(redis.get)).toBe(true);
  }, SETUP_TIMEOUT_MS);

  afterAll(() => testDatabase.teardown());

  beforeEach(() => {
    jest.clearAllMocks();
    AchievementEngine._setCache([trackedDefinition()]);
    redis.get.mockResolvedValue(null);
  });

  test("U6 schema 使用權威三組 PK，沒有 user 外鍵", async () => {
    const primaryKeyColumns = async tableName => {
      const rows = await mysql("information_schema.statistics")
        .where({
          table_schema: testDatabase.databaseName,
          table_name: tableName,
          index_name: "PRIMARY",
        })
        .orderBy("seq_in_index")
        .select("column_name");
      return rows.map(row => row.column_name || row.COLUMN_NAME);
    };

    await expect(primaryKeyColumns("achievement_user_lock")).resolves.toEqual(["user_id"]);
    await expect(primaryKeyColumns("achievement_tracked_item")).resolves.toEqual([
      "user_id",
      "achievement_id",
      "item_hash",
    ]);
    await expect(primaryKeyColumns("achievement_tracked_migration")).resolves.toEqual([
      "user_id",
      "achievement_id",
    ]);
    const userForeignKeys = await mysql("information_schema.key_column_usage")
      .where({ table_schema: testDatabase.databaseName })
      .whereIn("table_name", [
        "achievement_user_lock",
        "achievement_tracked_item",
        "achievement_tracked_migration",
      ])
      .where({ referenced_table_name: "user" });
    expect(userForeignKeys).toHaveLength(0);
  });

  test("Redis live membership + opaque baseline：舊兩項轉 marker，本次未知項只 +1，不寫 Redis", async () => {
    const userId = U("a");
    await seedProgress(userId, 5);
    redis.get.mockResolvedValueOnce(JSON.stringify(["synthetic-a", "synthetic-b"]));

    await expect(
      AchievementEngine.evaluateStrict(userId, "chat_message", { groupId: "synthetic-c" })
    ).resolves.toEqual({ unlocked: [] });

    expect(await markers(userId)).toHaveLength(3);
    expect(await progress(userId)).toMatchObject({ current_value: 6 });
    expect(await migration(userId)).toMatchObject({
      tracking_key: "groupId",
      redis_found: 1,
      item_count: 2,
      baseline_value: 5,
    });
    // marker 只有不可逆 64-char SHA-256，沒有原始 groupId。
    expect((await markers(userId)).every(row => /^[a-f0-9]{64}$/.test(row.item_hash))).toBe(true);
    expect(JSON.stringify(await markers(userId))).not.toContain("synthetic-");
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  test("本次 item 已在 Redis live membership：只建立 migration/marker，baseline 不增加；往後不再 GET", async () => {
    const userId = U("b");
    await seedProgress(userId, 5);
    redis.get.mockResolvedValueOnce(JSON.stringify(["synthetic-same"]));

    await AchievementEngine.evaluateStrict(userId, "chat_message", {
      groupId: "synthetic-same",
    });
    expect(await markers(userId)).toHaveLength(1);
    expect(await progress(userId)).toMatchObject({ current_value: 5 });
    expect(await migration(userId)).toBeDefined();

    await AchievementEngine.evaluateStrict(userId, "chat_message", {
      groupId: "synthetic-next",
    });
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(await markers(userId)).toHaveLength(2);
    expect(await progress(userId)).toMatchObject({ current_value: 6 });
  });

  test("Redis nil 是合法空集合：redis_found=0，本次 item +1", async () => {
    const userId = U("c");
    await seedProgress(userId, 2);
    redis.get.mockResolvedValueOnce(null);

    await AchievementEngine.evaluateStrict(userId, "chat_message", { groupId: "synthetic-new" });

    expect(await migration(userId)).toMatchObject({
      redis_found: 0,
      item_count: 0,
      baseline_value: 2,
    });
    expect(await markers(userId)).toHaveLength(1);
    expect(await progress(userId)).toMatchObject({ current_value: 3 });
  });

  test("GET 後 reward 失敗：migration/marker/progress/unlock/reward 全 rollback；retry 會再 GET", async () => {
    const userId = U("d");
    await seedProgress(userId, 5);
    AchievementEngine._setCache([
      trackedDefinition({ target_value: 6, reward_stones: 2147483648 }),
    ]);
    redis.get.mockResolvedValue(JSON.stringify(["synthetic-a", "synthetic-b"]));

    await expect(
      AchievementEngine.evaluateStrict(userId, "chat_message", { groupId: "synthetic-c" })
    ).rejects.toBeDefined();
    expect(await migration(userId)).toBeUndefined();
    expect(await markers(userId)).toHaveLength(0);
    expect(await progress(userId)).toMatchObject({ current_value: 5 });
    expect(await unlocks(userId)).toHaveLength(0);
    expect(await mysql("inventory").where({ userId, note: "成就獎勵" })).toHaveLength(0);

    AchievementEngine._setCache([trackedDefinition({ target_value: 99, reward_stones: 0 })]);
    await AchievementEngine.evaluateStrict(userId, "chat_message", { groupId: "synthetic-c" });
    expect(redis.get).toHaveBeenCalledTimes(2);
    expect(await migration(userId)).toBeDefined();
    expect(await markers(userId)).toHaveLength(3);
    expect(await progress(userId)).toMatchObject({ current_value: 6 });
  });

  test("GET 後模擬 legacy key 到期：成功 transaction 仍保存已觀測 membership，無 Redis 寫入", async () => {
    const userId = U("e");
    await seedProgress(userId, 1);
    let legacyValue = JSON.stringify(["synthetic-observed"]);
    redis.get.mockImplementationOnce(async () => {
      const observed = legacyValue;
      legacyValue = null; // 模擬 GET 後、DB commit 前 TTL 到期；core 不會再讀，也不會續 TTL。
      return observed;
    });

    await AchievementEngine.evaluateStrict(userId, "chat_message", {
      groupId: "synthetic-observed",
    });
    expect(legacyValue).toBeNull();
    expect(await markers(userId)).toHaveLength(1);
    expect(await migration(userId)).toMatchObject({ redis_found: 1, item_count: 1 });
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  test("tracking_key revision mismatch：strict throw；legacy 回空且不改 migration/marker/progress", async () => {
    const strictUser = U("f");
    const legacyUser = U("g");
    for (const userId of [strictUser, legacyUser]) {
      await seedProgress(userId, 4);
      await mysql("achievement_tracked_migration").insert({
        user_id: userId,
        achievement_id: trackedAchievement.id,
        tracking_key: "synthetic-old-revision",
        redis_found: 0,
        item_count: 0,
        baseline_value: 4,
      });
    }

    await expect(
      AchievementEngine.evaluateStrict(strictUser, "chat_message", { groupId: "synthetic-new" })
    ).rejects.toThrow("revision mismatch");
    await expect(
      AchievementEngine.evaluate(legacyUser, "chat_message", { groupId: "synthetic-new" })
    ).resolves.toEqual({ unlocked: [] });

    expect(redis.get).not.toHaveBeenCalled();
    expect(await markers(strictUser)).toHaveLength(0);
    expect(await markers(legacyUser)).toHaveLength(0);
    expect(await progress(strictUser)).toMatchObject({ current_value: 4 });
    expect(await progress(legacyUser)).toMatchObject({ current_value: 4 });
  });

  test("Redis error 與 malformed 不等同 nil：strict throw，無 migration/marker/progress 變更", async () => {
    const errorUser = U("h");
    const malformedUser = U("i");
    const legacyErrorUser = U("k");
    await seedProgress(errorUser, 3);
    await seedProgress(malformedUser, 3);
    await seedProgress(legacyErrorUser, 3);

    redis.get.mockRejectedValueOnce(new Error("synthetic Redis error"));
    await expect(
      AchievementEngine.evaluateStrict(errorUser, "chat_message", { groupId: "synthetic-new" })
    ).rejects.toThrow("synthetic Redis error");

    redis.get.mockResolvedValueOnce("not-json");
    await expect(
      AchievementEngine.evaluateStrict(malformedUser, "chat_message", {
        groupId: "synthetic-new",
      })
    ).rejects.toThrow("malformed");

    redis.get.mockRejectedValueOnce(new Error("synthetic legacy Redis error"));
    await expect(
      AchievementEngine.evaluate(legacyErrorUser, "chat_message", {
        groupId: "synthetic-new",
      })
    ).resolves.toEqual({ unlocked: [] });

    for (const userId of [errorUser, malformedUser, legacyErrorUser]) {
      expect(await migration(userId)).toBeUndefined();
      expect(await markers(userId)).toHaveLength(0);
      expect(await progress(userId)).toMatchObject({ current_value: 3 });
    }
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  test("兩真實連線同一未知 item：mutex 序列化，只有一個 marker 且 progress 只 +1", async () => {
    const userId = U("j");
    await seedProgress(userId, 8);
    redis.get.mockResolvedValue(null);

    await Promise.all([
      AchievementEngine.evaluateStrict(userId, "chat_message", { groupId: "synthetic-race" }),
      AchievementEngine.evaluateStrict(userId, "chat_message", { groupId: "synthetic-race" }),
    ]);

    expect(await markers(userId)).toHaveLength(1);
    expect(await progress(userId)).toMatchObject({ current_value: 9 });
    // 第一條交易做懶遷移；第二條看到 committed migration，不再 GET。
    expect(redis.get).toHaveBeenCalledTimes(1);
  });
});
