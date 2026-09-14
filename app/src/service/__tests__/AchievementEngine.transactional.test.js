// U6 / KTD6：AchievementEngine transaction core 與 per-user mutex 的真實 MySQL 證據。
// worldBossFixture 只會建立隨機 Princess_wbtest_ach_tx_* DB、跑 migration、最後 DROP 自己。
// Redis 使用 Jest 全域 mock；本檔不連既有 Redis，不 monkeypatch mysql.transaction。
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

const testDatabase = createWorldBossTestDatabase("ach_tx");
if (!/^Princess_wbtest_ach_tx_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);

const redis = require("../../util/redis");
const AchievementEngine = require("../AchievementEngine");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
let categoryId;
let incrementAchievement;
let mentionAchievement;

function definition(row, overrides = {}) {
  return {
    id: row.id,
    key: row.key,
    type: "milestone",
    target_value: 100,
    reward_stones: 0,
    condition: null,
    ...overrides,
  };
}

async function createSyntheticAchievement(key, overrides = {}) {
  const [id] = await mysql("achievements").insert({
    category_id: categoryId,
    key,
    name: key,
    description: "synthetic U6 fixture",
    icon: "test",
    type: "milestone",
    target_value: 1,
    reward_stones: 0,
    ...overrides,
  });
  return mysql("achievements").where({ id }).first();
}

async function progress(userId, achievementId) {
  return mysql("user_achievement_progress")
    .where({ user_id: userId, achievement_id: achievementId })
    .first();
}

async function rewards(userId) {
  return mysql("inventory").where({ userId, itemId: 999, note: "成就獎勵" });
}

const inflight = new Map();
let mutexSelectCount = 0;
mysql.on("query", query => {
  if (!query.__knexQueryUid) return;
  inflight.set(query.__knexQueryUid, query.sql);
  if (/achievement_user_lock.*for update/i.test(query.sql)) mutexSelectCount += 1;
});
mysql.on("query-response", (_result, query) => inflight.delete(query.__knexQueryUid));
mysql.on("query-error", (_error, query) => inflight.delete(query.__knexQueryUid));

function countInflight(pattern) {
  return [...inflight.values()].filter(sql => pattern.test(sql)).length;
}

async function waitUntil(predicate, { timeout = 15000, interval = 20 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}

async function provePathUsesMutex(userId, action) {
  await AchievementEngine.ensureUserLock(userId);
  const holder = await mysql.transaction();
  let pending;
  try {
    await holder("achievement_user_lock").where({ user_id: userId }).forUpdate().first();
    const selectsBefore = mutexSelectCount;
    pending = action();

    // Wrapper 的 trx 外 INSERT IGNORE 會先被同一 mutex row 擋住；不是 sleep 假定重疊。
    const blocked = await waitUntil(
      () => countInflight(/insert ignore into achievement_user_lock/i) === 1
    );
    expect(blocked).toBe(true);
    await holder.rollback();
    const result = await pending;
    expect(mutexSelectCount).toBeGreaterThan(selectsBefore);
    return result;
  } finally {
    if (!holder.isCompleted()) await holder.rollback().catch(() => {});
    if (pending) await pending.catch(() => {});
  }
}

describe("AchievementEngine transactional core (isolated DB)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_ach_tx_/);
    expect(databaseName).not.toBe("Princess");

    [categoryId] = await mysql("achievement_categories").insert({
      key: "u6_synthetic",
      name: "U6 synthetic",
      icon: "test",
      order: 99,
    });
    incrementAchievement = await mysql("achievements").where({ key: "chat_100" }).first();
    mentionAchievement = await mysql("achievements")
      .where({ key: "mention_admin_hi_self" })
      .first();
    expect(incrementAchievement).toBeDefined();
    expect(mentionAchievement).toBeDefined();
  }, SETUP_TIMEOUT_MS);

  afterAll(() => testDatabase.teardown());

  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  test("兩真實連線同 user 併發 evaluateStrict：mutex 序列化，increment 無 lost update", async () => {
    const userId = U("a");
    AchievementEngine._setCache([definition(incrementAchievement, { target_value: 99 })]);
    await AchievementEngine.ensureUserLock(userId);
    const holder = await mysql.transaction();
    let pending;
    try {
      await holder("achievement_user_lock").where({ user_id: userId }).forUpdate().first();
      pending = Promise.all([
        AchievementEngine.evaluateStrict(userId, "chat_message"),
        AchievementEngine.evaluateStrict(userId, "chat_message"),
      ]);
      // 兩個 autocommit ensure 都已送到不同 pool connection，且同時等待 holder 的 mutex row。
      const overlapped = await waitUntil(
        () => countInflight(/insert ignore into achievement_user_lock/i) === 2
      );
      expect(overlapped).toBe(true);
      await holder.rollback();
    } finally {
      if (!holder.isCompleted()) await holder.rollback().catch(() => {});
    }

    const [first, second] = await pending;

    expect(first).toEqual({ unlocked: [] });
    expect(second).toEqual({ unlocked: [] });
    expect(await progress(userId, incrementAchievement.id)).toMatchObject({ current_value: 2 });
    expect(await mysql("achievement_user_lock").where({ user_id: userId })).toHaveLength(1);
  });

  test("strict reward 寫入失敗：progress / unlock / reward 同 trx 全 rollback；legacy 只在最外層吞錯", async () => {
    const strictUser = U("b");
    const legacyUser = U("c");
    const tooLargeForInventoryInt = 2147483648;
    AchievementEngine._setCache([
      definition(incrementAchievement, {
        target_value: 1,
        reward_stones: tooLargeForInventoryInt,
      }),
    ]);
    await mysql("user_achievement_progress").insert([
      { user_id: strictUser, achievement_id: incrementAchievement.id, current_value: 0 },
      { user_id: legacyUser, achievement_id: incrementAchievement.id, current_value: 0 },
    ]);

    await expect(
      AchievementEngine.evaluateStrict(strictUser, "chat_message")
    ).rejects.toBeDefined();
    expect(await progress(strictUser, incrementAchievement.id)).toMatchObject({ current_value: 0 });
    expect(
      await mysql("user_achievements").where({
        user_id: strictUser,
        achievement_id: incrementAchievement.id,
      })
    ).toHaveLength(0);
    expect(await rewards(strictUser)).toHaveLength(0);

    await expect(AchievementEngine.evaluate(legacyUser, "chat_message")).resolves.toEqual({
      unlocked: [],
    });
    expect(await progress(legacyUser, incrementAchievement.id)).toMatchObject({ current_value: 0 });
    expect(
      await mysql("user_achievements").where({
        user_id: legacyUser,
        achievement_id: incrementAchievement.id,
      })
    ).toHaveLength(0);
    expect(await rewards(legacyUser)).toHaveLength(0);
  });

  test("被 mention 者沒有 user row：獨立 mutex 仍可建立並累加 progress", async () => {
    const mentioneeId = U("d");
    AchievementEngine._setCache([
      definition(mentionAchievement, {
        target_value: 10,
        condition: { keywords: ["synthetic"] },
      }),
    ]);
    expect(await mysql("user").where({ platform_id: mentioneeId }).first()).toBeUndefined();

    await expect(
      AchievementEngine.evaluateStrict(mentioneeId, "received_mention", {
        mentionedByUserId: U("e"),
        text: "synthetic",
      })
    ).resolves.toEqual({ unlocked: [] });

    expect(await progress(mentioneeId, mentionAchievement.id)).toMatchObject({ current_value: 1 });
    expect(
      await mysql("achievement_user_lock").where({ user_id: mentioneeId }).first()
    ).toBeDefined();
    expect(await mysql("user").where({ platform_id: mentioneeId }).first()).toBeUndefined();
  });

  test("legacy / strict / direct / batch 四路徑皆被同一 achievement_user_lock 互斥", async () => {
    const legacyUser = U("f");
    const strictUser = U("g");
    const directUser = U("h");
    const batchUser = U("i");
    const directAchievement = await createSyntheticAchievement("u6_direct_fixture");

    AchievementEngine._setCache([]);
    await expect(
      provePathUsesMutex(legacyUser, () => AchievementEngine.evaluate(legacyUser, "unknown_event"))
    ).resolves.toEqual({ unlocked: [] });

    AchievementEngine._setCache([]);
    await expect(
      provePathUsesMutex(strictUser, () =>
        AchievementEngine.evaluateStrict(strictUser, "unknown_event")
      )
    ).resolves.toEqual({ unlocked: [] });

    AchievementEngine._setCache([definition(directAchievement, { target_value: 1 })]);
    await expect(
      provePathUsesMutex(directUser, () =>
        AchievementEngine.unlockByKey(directUser, directAchievement.key)
      )
    ).resolves.toMatchObject({ unlocked: true });

    await mysql("chat_user_data").insert({ user_id: batchUser, current_exp: 1 });
    AchievementEngine._setCache([definition(incrementAchievement, { target_value: 99 })]);
    await expect(
      provePathUsesMutex(batchUser, () => AchievementEngine.batchEvaluate())
    ).resolves.toBeUndefined();
    expect(await progress(batchUser, incrementAchievement.id)).toMatchObject({ current_value: 1 });
    await mysql("chat_user_data").where({ user_id: batchUser }).delete();
  });

  test("direct unlockByKey：unlock 與 reward 同 trx commit，重複呼叫不二付", async () => {
    const userId = U("j");
    const achievement = await createSyntheticAchievement("u6_direct_reward_fixture");
    AchievementEngine._setCache([definition(achievement, { target_value: 1, reward_stones: 7 })]);

    await expect(AchievementEngine.unlockByKey(userId, achievement.key)).resolves.toMatchObject({
      unlocked: true,
    });
    await expect(AchievementEngine.unlockByKey(userId, achievement.key)).resolves.toEqual({
      unlocked: false,
      reason: "already_unlocked",
    });
    expect(
      await mysql("user_achievements").where({ user_id: userId, achievement_id: achievement.id })
    ).toHaveLength(1);
    expect(await rewards(userId)).toHaveLength(1);
  });

  test("batchEvaluate reward 失敗：該 user 的 progress / unlock / reward 全 rollback", async () => {
    const userId = U("k");
    await mysql("chat_user_data").insert({ user_id: userId, current_exp: 1 });
    AchievementEngine._setCache([
      definition(incrementAchievement, { target_value: 1, reward_stones: 2147483648 }),
    ]);

    await expect(AchievementEngine.batchEvaluate()).rejects.toBeDefined();
    expect(await progress(userId, incrementAchievement.id)).toBeUndefined();
    expect(
      await mysql("user_achievements").where({
        user_id: userId,
        achievement_id: incrementAchievement.id,
      })
    ).toHaveLength(0);
    expect(await rewards(userId)).toHaveLength(0);
  });

  test("batch broad scan 較舊時不覆寫 mutex 內已較新的 progress", async () => {
    const userId = U("n");
    await mysql("chat_user_data").insert({ user_id: userId, current_exp: 1 });
    await mysql("user_achievement_progress").insert({
      user_id: userId,
      achievement_id: incrementAchievement.id,
      current_value: 5,
    });
    AchievementEngine._setCache([definition(incrementAchievement, { target_value: 99 })]);

    await AchievementEngine.batchEvaluate();

    expect(await progress(userId, incrementAchievement.id)).toMatchObject({ current_value: 5 });
    await mysql("chat_user_data").where({ user_id: userId }).delete();
  });

  test("外部 transaction 可直接呼叫 evaluateInTransaction（U4 contract）", async () => {
    const userId = U("l");
    AchievementEngine._setCache([definition(incrementAchievement, { target_value: 99 })]);
    await AchievementEngine.ensureUserLock(userId);

    await expect(
      mysql.transaction(trx =>
        AchievementEngine.evaluateInTransaction(trx, userId, "chat_message", {})
      )
    ).resolves.toEqual({ unlocked: [] });
    expect(await progress(userId, incrementAchievement.id)).toMatchObject({ current_value: 1 });
  });

  test("外部 caller 在 core 成功後 rollback：progress / unlock / reward 仍不落地", async () => {
    const userId = U("m");
    AchievementEngine._setCache([
      definition(incrementAchievement, { target_value: 1, reward_stones: 7 }),
    ]);
    await AchievementEngine.ensureUserLock(userId);

    await expect(
      mysql.transaction(async trx => {
        const result = await AchievementEngine.evaluateInTransaction(
          trx,
          userId,
          "chat_message",
          {}
        );
        expect(result.unlocked).toHaveLength(1);
        throw new Error("synthetic caller rollback");
      })
    ).rejects.toThrow("synthetic caller rollback");

    expect(await progress(userId, incrementAchievement.id)).toBeUndefined();
    expect(
      await mysql("user_achievements").where({
        user_id: userId,
        achievement_id: incrementAchievement.id,
      })
    ).toHaveLength(0);
    expect(await rewards(userId)).toHaveLength(0);
  });
});
