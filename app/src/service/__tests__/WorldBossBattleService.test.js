require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");
const { PREFIX, ACTIVE_SLOT } = require("../../__tests__/helpers/worldBossFixture");
const MinigameLevel = require("../../model/application/MinigameLevel");
const WorldBoss = require("../../model/application/WorldBoss");
const { createBattleService } = require("../WorldBossBattleService");

const prefix = `${PREFIX}battle_`;
const now = new Date("2026-07-20T04:00:00.000Z");
const sentinel = {
  userId: `${prefix}sentinel_user`,
  bossName: `${prefix}sentinel_boss`,
  seasonName: `${prefix}sentinel_season`,
};

function ownedUserId(label) {
  return `${prefix}${label}`;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function domainCode(error) {
  return error && error.code;
}

async function cleanupOwned({ includeSentinels = false } = {}) {
  const cleanupPrefix = query => {
    query.whereRaw("LEFT(??, ?) = ?", ["platform_id", prefix.length, prefix]);
    if (!includeSentinels) query.whereNot({ platform_id: sentinel.userId });
    return query;
  };
  const seasons = await mysql("world_boss_season")
    .whereRaw("LEFT(??, ?) = ?", ["name", prefix.length, prefix])
    .modify(query => {
      if (!includeSentinels) query.whereNot({ name: sentinel.seasonName });
    })
    .select("id");
  const seasonIds = seasons.map(season => season.id);
  if (seasonIds.length) {
    await mysql("world_boss_season_reward").whereIn("season_id", seasonIds).del();
    await mysql("world_boss_contribution").whereIn("season_id", seasonIds).del();
    await mysql("world_boss_round").whereIn("season_id", seasonIds).del();
    await mysql("world_boss_season").whereIn("id", seasonIds).del();
  }
  await mysql("world_boss")
    .whereRaw("LEFT(??, ?) = ?", ["name", prefix.length, prefix])
    .modify(query => {
      if (!includeSentinels) query.whereNot({ name: sentinel.bossName });
    })
    .del();

  const users = await cleanupPrefix(mysql("user")).select("id");
  const userIds = users.map(user => user.id);
  if (userIds.length) await mysql("minigame_level").whereIn("user_id", userIds).del();
  await cleanupPrefix(mysql("user")).del();
}

async function createUser(userId, { progress = { level: 1, exp: 0 } } = {}) {
  const [id] = await mysql("user").insert({ platform: "line", platform_id: userId, status: 1 });
  if (progress) await mysql("minigame_level").insert({ user_id: id, ...progress });
  return id;
}

async function createBattleFixture({
  label,
  userId = ownedUserId(`${label}_user`),
  progress = { level: 1, exp: 0 },
  maxHp = 100,
  currentHp = maxHp,
  endTime = new Date("2026-07-21T04:00:00.000Z"),
} = {}) {
  const userDbId = await createUser(userId, { progress });
  const [bossId] = await mysql("world_boss").insert({
    name: `${prefix}${label}_boss`,
    hp_weight: 1,
  });
  const [seasonId] = await mysql("world_boss_season").insert({
    name: `${prefix}${label}_season`,
    status: "active",
    active_slot: ACTIVE_SLOT,
    start_time: new Date("2026-07-19T04:00:00.000Z"),
    end_time: endTime,
  });
  const [roundId] = await mysql("world_boss_round").insert({
    season_id: seasonId,
    round_no: 1,
    world_boss_id: bossId,
    max_hp: maxHp,
    current_hp: currentHp,
    status: "active",
    active_slot: ACTIVE_SLOT,
  });
  return { userId, userDbId, bossId, seasonId, roundId };
}

async function assertSentinelsPreserved() {
  await expect(
    mysql("user").where({ platform_id: sentinel.userId }).first()
  ).resolves.toMatchObject({
    platform: "line",
    status: 1,
  });
  await expect(
    mysql("world_boss").where({ name: sentinel.bossName }).first()
  ).resolves.toMatchObject({
    hp_weight: "1.000",
  });
  await expect(
    mysql("world_boss_season").where({ name: sentinel.seasonName }).first()
  ).resolves.toMatchObject({ status: "draft", active_slot: null });
}

beforeAll(async () => {
  await cleanupOwned({ includeSentinels: true });
  await mysql("user").insert({ platform: "line", platform_id: sentinel.userId, status: 1 });
  await mysql("world_boss").insert({ name: sentinel.bossName, hp_weight: 1 });
  await mysql("world_boss_season").insert({
    name: sentinel.seasonName,
    status: "draft",
    end_time: new Date("2030-01-01T00:00:00.000Z"),
  });
});

beforeEach(async () => {
  await cleanupOwned();
  await assertSentinelsPreserved();
});

afterEach(async () => {
  await cleanupOwned();
  await assertSentinelsPreserved();
});

afterAll(async () => {
  await cleanupOwned();
  await assertSentinelsPreserved();
  await cleanupOwned({ includeSentinels: true });
  await mysql.destroy();
});

describe("WorldBossBattleService", () => {
  test("normal hit changes HP, contribution, RPG EXP, totals, and daily quota atomically", async () => {
    const fixture = await createBattleFixture({ label: "normal" });
    const service = createBattleService({ clock: () => now });

    const result = await service.attack({
      userId: fixture.userId,
      attackType: "standard",
      damage: 25,
      cost: 10,
      exp: 5,
    });

    expect(result).toMatchObject({
      damage: 25,
      cost: 10,
      seasonTotalDamage: "25",
      daily: { limit: 100, used: 10, remaining: 90 },
      levelResult: {
        levelUp: false,
        newLevel: 1,
        newExp: 5,
        levelUpCount: 0,
        nextLevelExp: 24,
      },
    });
    expect(Number(result.season.id)).toBe(fixture.seasonId);
    expect(Number(result.round.id)).toBe(fixture.roundId);
    expect(Number(result.boss.id)).toBe(fixture.bossId);
    expect(result.clearedRounds).toEqual([]);

    const round = await mysql("world_boss_round").where({ id: fixture.roundId }).first();
    expect(Number(round.current_hp)).toBe(75);
    await expect(
      mysql("world_boss_contribution").where({ season_id: fixture.seasonId }).first()
    ).resolves.toMatchObject({ user_id: fixture.userId, damage: 25, cost: 10 });
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toMatchObject({ level: 1, exp: 5 });
  });

  test("accepts standard and skill but rejects invalid attack input before hooks or writes", async () => {
    const fixture = await createBattleFixture({ label: "validation" });
    const onAttackStarted = jest.fn();
    const service = createBattleService({ clock: () => now, hooks: { onAttackStarted } });
    const before = {
      round: await mysql("world_boss_round").where({ id: fixture.roundId }).first(),
      progress: await mysql("minigame_level").where({ user_id: fixture.userDbId }).first(),
    };

    await expect(
      service.attack({
        userId: fixture.userId,
        attackType: "unknown",
        damage: 1,
        cost: 1,
        exp: 1,
      })
    ).rejects.toMatchObject({ code: "INVALID_ATTACK_TYPE" });
    for (const field of ["damage", "cost", "exp"]) {
      for (const value of [0, -1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        await expect(
          service.attack({
            userId: fixture.userId,
            attackType: "standard",
            damage: 1,
            cost: 1,
            exp: 1,
            [field]: value,
          })
        ).rejects.toMatchObject({ code: `INVALID_${field.toUpperCase()}` });
      }
    }
    expect(onAttackStarted).not.toHaveBeenCalled();
    expect(await mysql("world_boss_contribution").where({ season_id: fixture.seasonId })).toEqual(
      []
    );
    await expect(mysql("world_boss_round").where({ id: fixture.roundId }).first()).resolves.toEqual(
      before.round
    );
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toEqual(before.progress);

    await expect(
      service.attack({
        userId: fixture.userId,
        attackType: "standard",
        damage: 1,
        cost: 1,
        exp: 1,
      })
    ).resolves.toMatchObject({ damage: 1, cost: 1 });
    await expect(
      service.attack({
        userId: fixture.userId,
        attackType: "skill",
        damage: 1,
        cost: 1,
        exp: 1,
      })
    ).resolves.toMatchObject({ damage: 1, cost: 1 });
  });

  test("rejects invalid HP output and createRound never inserts a non-positive max HP", async () => {
    const service = createBattleService({ clock: () => now });
    for (const [roundNo, hpWeight] of [
      [0, 1],
      [1, 0],
      [1, -1],
      [1, Number.NaN],
      [1, Infinity],
      [1, Number.MIN_VALUE],
    ]) {
      expect(() => service.hpForRound(roundNo, hpWeight)).toThrow();
    }

    const listSpy = jest
      .spyOn(WorldBoss, "list")
      .mockResolvedValue([{ id: 987654321, hp_weight: Number.MIN_VALUE }]);
    try {
      await mysql.transaction(async trx => {
        await expect(service.createRound(trx, 123, 1)).rejects.toMatchObject({
          code: "INVALID_MAX_HP",
        });
      });
    } finally {
      listSpy.mockRestore();
    }
  });

  test("compares BIGINT boss ids exactly when excluding the previous boss", () => {
    const { excludeBoss } = require("../WorldBossBattleService");
    const bosses = [{ id: "9007199254740992" }, { id: "9007199254740993" }];

    expect(excludeBoss(bosses, "9007199254740992")).toEqual([{ id: "9007199254740993" }]);
  });

  test("subtracts a safe attack from BIGINT HP exactly and returns an exact season total", async () => {
    const fixture = await createBattleFixture({
      label: "exact_hp",
      maxHp: "9007199254740993",
      currentHp: "9007199254740993",
    });
    await mysql("world_boss_contribution").insert({
      season_id: fixture.seasonId,
      round_id: fixture.roundId,
      user_id: fixture.userId,
      damage: "9007199254740991",
      cost: 1,
      created_at: new Date(now.getTime() - 1),
      updated_at: new Date(now.getTime() - 1),
    });
    const service = createBattleService({ clock: () => now });

    const result = await service.attack({
      userId: fixture.userId,
      attackType: "standard",
      damage: 1,
      cost: 1,
      exp: 1,
    });

    await expect(
      mysql("world_boss_round").where({ id: fixture.roundId }).first()
    ).resolves.toMatchObject({
      current_hp: "9007199254740992",
    });
    expect(result.round.current_hp).toBe("9007199254740992");
    expect(result.seasonTotalDamage).toBe("9007199254740992");
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  test("subtracts near-limit damage from BIGINT HP without rounding", async () => {
    const fixture = await createBattleFixture({
      label: "hp_rem",
      maxHp: "9007199254740993",
      currentHp: "9007199254740993",
    });
    const service = createBattleService({ clock: () => now });

    await expect(
      service.attack({
        userId: fixture.userId,
        attackType: "standard",
        damage: Number.MAX_SAFE_INTEGER,
        cost: 1,
        exp: 1,
      })
    ).resolves.toMatchObject({ seasonTotalDamage: "9007199254740991" });

    await expect(
      mysql("world_boss_round").where({ id: fixture.roundId }).first()
    ).resolves.toMatchObject({ current_hp: 2 });
  });

  test("one overkill attack clears multiple rounds and creates exactly one damaged successor", async () => {
    const fixture = await createBattleFixture({
      label: "overkill",
      maxHp: 100,
      currentHp: 100,
    });
    const damage = 45123;
    const cost = 10;
    const exp = 7;
    const updateSpy = jest.spyOn(MinigameLevel, "updateByUserId");
    const listSpy = jest
      .spyOn(WorldBoss, "list")
      .mockImplementation(trx => trx("world_boss").where({ id: fixture.bossId }));
    const service = createBattleService({ clock: () => now });

    try {
      const result = await service.attack({
        userId: fixture.userId,
        attackType: "skill",
        damage,
        cost,
        exp,
      });

      expect(result).toMatchObject({
        clearedRounds: [1, 2],
        damage,
        cost,
        seasonTotalDamage: "45123",
        daily: { limit: 100, used: cost, remaining: 90 },
        levelResult: {
          levelUp: false,
          newLevel: 1,
          newExp: exp,
          levelUpCount: 0,
          nextLevelExp: 24,
        },
      });
      expect(Number(result.boss.id)).toBe(fixture.bossId);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith(fixture.userId, { level: 1, exp }, expect.anything());

      const rounds = await mysql("world_boss_round")
        .where({ season_id: fixture.seasonId })
        .orderBy("round_no");
      expect(rounds).toEqual([
        expect.objectContaining({
          id: fixture.roundId,
          round_no: 1,
          world_boss_id: fixture.bossId,
          current_hp: 0,
          status: "cleared",
          active_slot: null,
        }),
        expect.objectContaining({
          round_no: 2,
          world_boss_id: fixture.bossId,
          current_hp: 0,
          status: "cleared",
          active_slot: null,
        }),
        expect.objectContaining({
          round_no: 3,
          world_boss_id: fixture.bossId,
          max_hp: 60000,
          current_hp: 59977,
          status: "active",
          active_slot: ACTIVE_SLOT,
        }),
      ]);
      const activeRounds = rounds.filter(round => round.status === "active");
      expect(activeRounds).toHaveLength(1);
      expect(Number(result.round.id)).toBe(Number(activeRounds[0].id));

      await expect(
        mysql("world_boss_contribution").where({ season_id: fixture.seasonId })
      ).resolves.toEqual([
        expect.objectContaining({
          round_id: fixture.roundId,
          user_id: fixture.userId,
          damage,
          cost,
        }),
      ]);
      await expect(
        mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
      ).resolves.toMatchObject({ level: 1, exp });
      await expect(service.getRemainingDailyCost(fixture.userId)).resolves.toEqual({
        limit: 100,
        used: cost,
        remaining: 90,
      });
    } finally {
      listSpy.mockRestore();
      updateSpy.mockRestore();
    }
  });

  test("treats now equal to end_time as ended without quota, HP, contribution, or EXP writes", async () => {
    const fixture = await createBattleFixture({ label: "ended", endTime: now });
    const service = createBattleService({ clock: () => now });
    const beforeRound = await mysql("world_boss_round").where({ id: fixture.roundId }).first();
    const beforeProgress = await mysql("minigame_level")
      .where({ user_id: fixture.userDbId })
      .first();

    await expect(
      service.attack({
        userId: fixture.userId,
        attackType: "standard",
        damage: 100,
        cost: 10,
        exp: 10,
      })
    ).rejects.toMatchObject({ code: "SEASON_ENDED" });

    await expect(mysql("world_boss_round").where({ id: fixture.roundId }).first()).resolves.toEqual(
      beforeRound
    );
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toEqual(beforeProgress);
    expect(await mysql("world_boss_contribution").where({ season_id: fixture.seasonId })).toEqual(
      []
    );
  });

  test("samples expiry after acquiring the season lock", async () => {
    const fixture = await createBattleFixture({
      label: "lock_expiry",
      endTime: new Date(now.getTime() + 1),
    });
    let clockCall = 0;
    const service = createBattleService({
      clock: () => {
        clockCall += 1;
        return new Date(now.getTime() + 1);
      },
    });

    await expect(
      service.attack({
        userId: fixture.userId,
        attackType: "standard",
        damage: 1,
        cost: 1,
        exp: 1,
      })
    ).rejects.toMatchObject({ code: "SEASON_ENDED" });
    expect(clockCall).toBe(1);
    expect(await mysql("world_boss_contribution").where({ season_id: fixture.seasonId })).toEqual(
      []
    );
  });

  test("forced EXP hook failure rolls back contribution, HP, cleared/new rounds, and EXP", async () => {
    const fixture = await createBattleFixture({ label: "rollback", maxHp: 5, currentHp: 5 });
    const forcedError = new Error("forced exp failure");
    const service = createBattleService({
      clock: () => now,
      hooks: { beforeExpUpdate: jest.fn().mockRejectedValue(forcedError) },
    });

    await expect(
      service.attack({
        userId: fixture.userId,
        attackType: "skill",
        damage: 10,
        cost: 10,
        exp: 5,
      })
    ).rejects.toBe(forcedError);

    await expect(mysql("world_boss_round").where({ season_id: fixture.seasonId })).resolves.toEqual(
      [
        expect.objectContaining({
          id: fixture.roundId,
          status: "active",
          active_slot: ACTIVE_SLOT,
          current_hp: 5,
        }),
      ]
    );
    expect(await mysql("world_boss_contribution").where({ season_id: fixture.seasonId })).toEqual(
      []
    );
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toMatchObject({ level: 1, exp: 0 });
  });

  test("two first attacks create one progress row and update it through the serialized transaction", async () => {
    const userId = ownedUserId("new_player");
    const fixture = await createBattleFixture({ label: "new_player", userId, progress: null });
    const service = createBattleService({ clock: () => now });

    const first = service.attack({ userId, attackType: "standard", damage: 1, cost: 1, exp: 1 });
    const second = service.attack({ userId, attackType: "skill", damage: 1, cost: 1, exp: 1 });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    const progressRows = await mysql("minigame_level").where({ user_id: fixture.userDbId });
    expect(progressRows).toHaveLength(1);
    expect(progressRows[0]).toMatchObject({ level: 1, exp: 2 });
  });

  test("uses a half-open Taipei civil day independent of the MySQL session timezone", async () => {
    const fixture = await createBattleFixture({ label: "day_range" });
    const service = createBattleService({ clock: () => now });
    const startUtc = new Date("2026-07-19T16:00:00.000Z");
    const endUtc = new Date("2026-07-20T16:00:00.000Z");
    expect(service.taipeiDayRange(new Date("2026-07-20T15:59:59.999Z"))).toEqual({
      startUtc,
      endUtc,
    });
    expect(service.taipeiDayRange(new Date("2026-07-20T16:00:00.000Z"))).toEqual({
      startUtc: endUtc,
      endUtc: new Date("2026-07-21T16:00:00.000Z"),
    });
    for (const invalid of [new Date("invalid"), null, "2026-07-20"]) {
      expect(() => service.taipeiDayRange(invalid)).toThrow("INVALID_DATE");
    }

    await mysql("world_boss_contribution").insert([
      {
        season_id: fixture.seasonId,
        round_id: fixture.roundId,
        user_id: fixture.userId,
        damage: 1,
        cost: 10,
        created_at: new Date("2026-07-19T15:59:59.000Z"),
        updated_at: new Date("2026-07-19T15:59:59.000Z"),
      },
      {
        season_id: fixture.seasonId,
        round_id: fixture.roundId,
        user_id: fixture.userId,
        damage: 1,
        cost: 20,
        created_at: startUtc,
        updated_at: startUtc,
      },
      {
        season_id: fixture.seasonId,
        round_id: fixture.roundId,
        user_id: fixture.userId,
        damage: 1,
        cost: 30,
        created_at: endUtc,
        updated_at: endUtc,
      },
    ]);

    await expect(service.getRemainingDailyCost(fixture.userId)).resolves.toEqual({
      limit: 100,
      used: 20,
      remaining: 80,
    });
  });

  test("calculates exact multi-level and max-level EXP transitions and persists once in the trx", async () => {
    const fixture = await createBattleFixture({
      label: "exp",
      progress: { level: 1, exp: 100 },
    });
    const service = createBattleService({ clock: () => now });
    const units = [
      { level: 1, max_exp: 0 },
      { level: 2, max_exp: 1000 },
      { level: 3, max_exp: 1000 },
      { level: 4, max_exp: 1000 },
    ];

    expect(service.calculateJobExpTransition({ level: 1, exp: 100 }, 200, units)).toEqual({
      levelUp: false,
      newLevel: 1,
      newExp: 300,
      levelUpCount: 0,
      nextLevelExp: 1000,
    });
    expect(service.calculateJobExpTransition({ level: 1, exp: 900 }, 2200, units)).toEqual({
      levelUp: true,
      newLevel: 4,
      newExp: 100,
      levelUpCount: 3,
      nextLevelExp: null,
    });
    expect(service.calculateJobExpTransition({ level: 4, exp: 500 }, 120, units)).toEqual({
      levelUp: false,
      newLevel: 4,
      newExp: 620,
      levelUpCount: 0,
      nextLevelExp: null,
    });
    expect(service.calculateJobExpTransition({ level: 1, exp: 100 }, 0, units)).toEqual({
      levelUp: false,
      newLevel: 1,
      newExp: 100,
      levelUpCount: 0,
      nextLevelExp: 1000,
    });
    expect(() =>
      service.calculateJobExpTransition({ level: 1, exp: 0 }, 1, [
        { level: 1, max_exp: 0 },
        { level: 2, max_exp: 10 },
        { level: 2, max_exp: 20 },
      ])
    ).toThrow("INVALID_JOB_EXP_DATA");
    expect(() => service.calculateJobExpTransition({ level: 1 }, 1, units)).toThrow(
      "INVALID_JOB_EXP_DATA"
    );
    expect(() =>
      service.calculateJobExpTransition({ level: 1, exp: 0 }, 1, [
        { level: 1, max_exp: 0 },
        { level: 3, max_exp: 10 },
      ])
    ).toThrow("INVALID_JOB_EXP_DATA");

    const updateSpy = jest.spyOn(MinigameLevel, "updateByUserId");
    try {
      await mysql.transaction(async trx => {
        const progress = await MinigameLevel.lockUserAndProgress(
          fixture.userId,
          { level: 1, exp: 0 },
          trx
        );
        const levelResult = await service.applyJobExp({
          userId: fixture.userId,
          progress,
          earnedExp: 200,
          levelUnits: units,
          trx,
        });
        expect(levelResult).toEqual({
          levelUp: false,
          newLevel: 1,
          newExp: 300,
          levelUpCount: 0,
          nextLevelExp: 1000,
        });
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith(fixture.userId, { level: 1, exp: 300 }, trx);
        await expect(
          trx("minigame_level").where({ user_id: fixture.userDbId }).first()
        ).resolves.toMatchObject({ level: 1, exp: 300 });
      });
    } finally {
      updateSpy.mockRestore();
    }
  });

  test("serializes near-limit attacks so exactly one reaches cost 100 and changes HP and EXP", async () => {
    const fixture = await createBattleFixture({ label: "quota", maxHp: 100, currentHp: 100 });
    await mysql("world_boss_contribution").insert({
      season_id: fixture.seasonId,
      round_id: fixture.roundId,
      user_id: fixture.userId,
      damage: 1,
      cost: 90,
      created_at: now,
      updated_at: now,
    });
    const service = createBattleService({ clock: () => now });

    const first = service.attack({
      userId: fixture.userId,
      attackType: "standard",
      damage: 10,
      cost: 10,
      exp: 5,
    });
    const second = service.attack({
      userId: fixture.userId,
      attackType: "skill",
      damage: 10,
      cost: 10,
      exp: 5,
    });
    const settled = await Promise.allSettled([first, second]);

    expect(settled.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.filter(result => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(domainCode(rejected[0].reason)).toBe("DAILY_LIMIT_EXCEEDED");
    await expect(service.getRemainingDailyCost(fixture.userId)).resolves.toEqual({
      limit: 100,
      used: 100,
      remaining: 0,
    });
    await expect(
      mysql("world_boss_round").where({ id: fixture.roundId }).first()
    ).resolves.toMatchObject({ current_hp: 90 });
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toMatchObject({ level: 1, exp: 5 });
  });

  test("two real lethal attacks exercise named UNIQUE recovery and preserve both contributions", async () => {
    const firstUserId = ownedUserId("recovery_a");
    const fixture = await createBattleFixture({
      label: "recovery",
      userId: firstUserId,
      maxHp: 10,
      currentHp: 10,
    });
    const secondUserId = ownedUserId("recovery_b");
    await createUser(secondUserId);

    const firstAtInsert = deferred();
    const releaseFirst = deferred();
    const secondStarted = deferred();
    const firstAfterLock = jest.fn();
    const secondAfterLock = jest.fn();
    const onRoundConflict = jest.fn();
    let competingRoundId;
    let insertedPayload;
    const firstService = createBattleService({
      clock: () => now,
      hooks: {
        afterSeasonLock: firstAfterLock,
        beforeRoundInsert: async ({ trx, seasonId, roundNo, payload }) => {
          insertedPayload = payload;
          firstAtInsert.resolve();
          await releaseFirst.promise;
          [competingRoundId] = await trx("world_boss_round").insert(payload);
          expect(seasonId).toBe(fixture.seasonId);
          expect(roundNo).toBe(2);
        },
        onRoundConflict,
      },
    });
    const secondService = createBattleService({
      clock: () => now,
      hooks: {
        onAttackStarted: () => secondStarted.resolve(),
        afterSeasonLock: secondAfterLock,
      },
    });

    const firstAttack = firstService.attack({
      userId: firstUserId,
      attackType: "standard",
      damage: 10,
      cost: 10,
      exp: 1,
    });
    await firstAtInsert.promise;
    expect(firstAfterLock).toHaveBeenCalledTimes(1);

    const secondAttack = secondService.attack({
      userId: secondUserId,
      attackType: "skill",
      damage: 10,
      cost: 10,
      exp: 1,
    });
    await secondStarted.promise;
    expect(secondAfterLock).not.toHaveBeenCalled();
    releaseFirst.resolve();

    const [firstResult, secondResult] = await Promise.all([firstAttack, secondAttack]);
    expect(secondAfterLock).toHaveBeenCalledTimes(1);
    expect(insertedPayload).toMatchObject({
      season_id: fixture.seasonId,
      round_no: 2,
      status: "active",
      active_slot: ACTIVE_SLOT,
    });
    expect(onRoundConflict).toHaveBeenCalledTimes(1);
    expect(onRoundConflict.mock.calls[0][0]).toMatchObject({
      seasonId: fixture.seasonId,
      roundNo: 2,
      error: expect.objectContaining({ code: "ER_DUP_ENTRY" }),
    });
    expect(
      `${onRoundConflict.mock.calls[0][0].error.sqlMessage || onRoundConflict.mock.calls[0][0].error.message}`
    ).toMatch(/uq_wbr_season_round|uq_wbr_season_active_slot/);
    expect(Number(firstResult.round.id)).toBe(competingRoundId);
    expect(Number(secondResult.round.id)).toBe(competingRoundId);

    const activeRounds = await mysql("world_boss_round").where({
      season_id: fixture.seasonId,
      status: "active",
    });
    expect(activeRounds).toHaveLength(1);
    expect(Number(activeRounds[0].id)).toBe(competingRoundId);
    const duplicateRounds = await mysql("world_boss_round")
      .where({ season_id: fixture.seasonId })
      .select("round_no")
      .count({ count: "id" })
      .groupBy("round_no")
      .havingRaw("COUNT(*) > 1");
    expect(duplicateRounds).toEqual([]);
    const contributions = await mysql("world_boss_contribution")
      .where({ season_id: fixture.seasonId })
      .orderBy("user_id");
    expect(contributions.map(row => row.user_id)).toEqual([firstUserId, secondUserId]);
  });
});
