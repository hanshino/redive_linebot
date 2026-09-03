jest.mock("../WorldBossBattleService", () => ({
  attack: jest.fn(),
}));
jest.mock("../WorldBossSeasonService", () => ({ getLatestSettledResult: jest.fn() }));
jest.mock("../MinigameService", () => ({ findByUserId: jest.fn(), createByUserId: jest.fn() }));
jest.mock("../EquipmentService", () => ({ getEquipmentBonuses: jest.fn() }));
jest.mock("../AchievementEngine", () => ({ evaluate: jest.fn() }));
jest.mock("../../model/application/RPGCharacter", () => ({ make: jest.fn() }));
jest.mock("../../model/application/UserModel", () => ({ getProfile: jest.fn() }));
jest.mock("../../util/broadcastQueue", () => ({ pushEvent: jest.fn() }));
jest.mock("../../util/redis", () => ({ set: jest.fn(), get: jest.fn(), eval: jest.fn() }));

const mockLineClient = {
  pushMessage: jest.fn(),
  multicast: jest.fn(),
  broadcast: jest.fn(),
  replyMessage: jest.fn(),
  reply: jest.fn(),
};
jest.mock("bottender", () => ({ getClient: jest.fn(() => mockLineClient) }));

const BattleService = require("../WorldBossBattleService");
const SeasonService = require("../WorldBossSeasonService");
const MinigameService = require("../MinigameService");
const EquipmentService = require("../EquipmentService");
const AchievementEngine = require("../AchievementEngine");
const RPGCharacter = require("../../model/application/RPGCharacter");
const UserModel = require("../../model/application/UserModel");
const broadcastQueue = require("../../util/broadcastQueue");
const redis = require("../../util/redis");
const { DefaultLogger } = require("../../util/Logger");
const AttackService = require("../WorldBossAttackService");
const ActualRPGCharacter = jest.requireActual("../../model/application/RPGCharacter");

const USER = "Uattacker";
const GROUP = `C${"a".repeat(32)}`;
const OTHER_GROUP = `C${"b".repeat(32)}`;
const ROOM = `R${"c".repeat(32)}`;

function character({ standard = 100, skill = 200, skillCost = 7 } = {}) {
  return {
    getStandardDamage: jest.fn(() => standard),
    getSkillOneDamage: jest.fn(() => skill),
    skillOne: { cost: skillCost },
  };
}

function result(overrides = {}) {
  return {
    rawDamage: "100",
    effectDamage: "0",
    effectiveDamage: "100",
    overkillDamage: "0",
    scoreGained: { direct: "100", assist: "0", relay: "0" },
    consumedEffect: null,
    createdEffect: null,
    cost: 10,
    cleared: false,
    cycleAdvanced: false,
    attackedCycleNo: 3,
    cycleNo: 3,
    boss: { id: 7, position: 2, name: "冰狼" },
    levelResult: { levelUp: false },
    seasonTotalDamage: "1000",
    seasonTotalScore: "1000",
    daily: { limit: 100, used: 10, remaining: 90 },
    ...overrides,
  };
}

function error(code) {
  return Object.assign(new Error(code), { code });
}

function expectReplyOnlyDelivery() {
  expect(mockLineClient.pushMessage).not.toHaveBeenCalled();
  expect(mockLineClient.multicast).not.toHaveBeenCalled();
  expect(mockLineClient.broadcast).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  redis.set.mockResolvedValue("OK");
  redis.get.mockResolvedValue(GROUP);
  redis.eval.mockResolvedValue(1);
  MinigameService.findByUserId.mockResolvedValue({ level: 4, job_key: "swordman" });
  EquipmentService.getEquipmentBonuses.mockResolvedValue({
    atk_percent: 0,
    cost_reduction: 0,
    exp_bonus: 0,
  });
  RPGCharacter.make.mockReturnValue(character());
  BattleService.attack.mockResolvedValue(result());
  SeasonService.getLatestSettledResult.mockResolvedValue(null);
  AchievementEngine.evaluate.mockResolvedValue({ unlocked: [] });
  UserModel.getProfile.mockResolvedValue(null);
  broadcastQueue.pushEvent.mockResolvedValue(true);
});

describe("WorldBossAttackService — input validation", () => {
  it.each([undefined, null, "", 0, "0", "-1", "1.5", "abc", " 1", {}])(
    "rejects roundId %p before any side effect",
    async roundId => {
      await expect(
        AttackService.attack({ userId: USER, roundId, attackType: "standard" })
      ).rejects.toMatchObject({ code: "INVALID_ROUND_ID" });
      expect(redis.set).not.toHaveBeenCalled();
      expect(BattleService.attack).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, null, "", "ultimate", "STANDARD", 1])(
    "rejects attackType %p before any side effect",
    async attackType => {
      await expect(
        AttackService.attack({ userId: USER, roundId: 2, attackType })
      ).rejects.toMatchObject({ code: "INVALID_ATTACK_TYPE" });
      expect(redis.set).not.toHaveBeenCalled();
      expect(BattleService.attack).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, null, "", 123])("rejects userId %p", async userId => {
    await expect(
      AttackService.attack({ userId, roundId: 2, attackType: "standard" })
    ).rejects.toMatchObject({ code: "INVALID_USER" });
    expect(BattleService.attack).not.toHaveBeenCalled();
  });

  // Legacy-card compatibility: old group Flex cards already delivered to LINE chat
  // history still postback attackType "standard". The button that produced it is gone
  // from the template, but this value must keep working forever, or every old card in
  // every group's history silently stops responding when tapped.
  it("still accepts the retired 'standard' attackType (old Flex cards in chat history)", async () => {
    await AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" });
    expect(BattleService.attack).toHaveBeenCalledWith(
      expect.objectContaining({ attackType: "standard" })
    );
  });
});

describe("WorldBossAttackService — the shared attack seam", () => {
  describe.each([
    ["adventurer", 8, 1.2],
    ["swordman", 10, 1.8],
    ["mage", 7, 0.7],
    ["thief", 20, 2.1],
  ])("RPG skill contract — %s", (jobKey, expectedCost, expectedRate) => {
    it("uses the adjusted cost and rate", () => {
      const instance = ActualRPGCharacter.make(jobKey, { level: 100 });
      expect(instance.skillOne).toEqual(
        expect.objectContaining({
          cost: expectedCost,
          rate: expectedRate,
        })
      );
    });

    it("uses normal damage and does not add an unintended critical hit", () => {
      const instance = ActualRPGCharacter.make(jobKey, { level: 100 });
      jest.spyOn(instance, "getNormalDamage").mockReturnValue(1000);
      const critical = jest.spyOn(instance, "isCritical").mockReturnValue(false);

      expect(instance.getSkillOneDamage()).toBe(Math.floor(1000 * expectedRate));
      if (jobKey === "swordman" || jobKey === "adventurer") {
        expect(critical).not.toHaveBeenCalled();
      }
    });
  });

  it("keeps mage and thief critical settings unchanged", () => {
    expect(ActualRPGCharacter.make("mage", { level: 100 }).skillOne).toEqual(
      expect.objectContaining({
        criticalRate: 25,
        criticalConfig: [
          { min: 1.8, max: 2.2, rate: 60 },
          { min: 2.2, max: 2.6, rate: 25 },
          { min: 2.6, max: 3.0, rate: 12 },
          { min: 3.0, max: 3.5, rate: 3 },
        ],
      })
    );
    expect(ActualRPGCharacter.make("thief", { level: 100 }).skillOne).toEqual(
      expect.objectContaining({
        criticalRate: 50,
        criticalConfig: [
          { min: 1.2, max: 1.5, rate: 10 },
          { min: 1.5, max: 2.0, rate: 25 },
          { min: 2.0, max: 2.8, rate: 35 },
          { min: 2.8, max: 3.8, rate: 25 },
          { min: 3.8, max: 5.0, rate: 5 },
        ],
      })
    );
    expect(ActualRPGCharacter.make("swordman", { level: 100 }).skillOne).not.toHaveProperty(
      "criticalRate"
    );
  });

  it("keeps standard attacks independent from skill values", () => {
    const instance = ActualRPGCharacter.make("mage", { level: 100 });
    expect(instance.getStandardDamage()).toBe(11000);
    expect(instance.attack()).toBe(11000);
  });

  it("computes standard damage, base cost and exp from RPG + equipment exactly", async () => {
    const standard = character({ standard: 100, skill: 999, skillCost: 7 });
    RPGCharacter.make.mockReturnValue(standard);
    MinigameService.findByUserId.mockResolvedValue({ level: 8, job_key: "mage" });
    EquipmentService.getEquipmentBonuses.mockResolvedValue({
      atk_percent: 0.25,
      cost_reduction: 2,
      exp_bonus: 5,
    });

    await AttackService.attack({ userId: USER, roundId: "2", attackType: "standard" });

    expect(RPGCharacter.make).toHaveBeenCalledWith("mage", { level: 8 });
    expect(standard.getStandardDamage).toHaveBeenCalledTimes(1);
    expect(standard.getSkillOneDamage).not.toHaveBeenCalled();
    expect(BattleService.attack).toHaveBeenCalledWith({
      userId: USER,
      attackType: "standard",
      roundId: "2",
      rawDamage: 125,
      jobKey: "mage",
      cost: 8,
      exp: 125,
    });
    // The transitional `damage` alias is gone: BattleService takes rawDamage + jobKey only.
    // toHaveBeenCalledWith is exact, so an extra key would already fail — this asserts the
    // intent explicitly so a future re-add is caught by name.
    expect(BattleService.attack.mock.calls[0][0]).not.toHaveProperty("damage");
  });

  it("computes skill damage and skill cost with equipment bonuses exactly", async () => {
    const skill = character({ standard: 99, skill: 200, skillCost: 7 });
    RPGCharacter.make.mockReturnValue(skill);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({
      atk_percent: 0.5,
      cost_reduction: 2,
      exp_bonus: 3,
    });

    await AttackService.attack({ userId: USER, roundId: 2, attackType: "skill" });

    expect(skill.getStandardDamage).not.toHaveBeenCalled();
    expect(skill.getSkillOneDamage).toHaveBeenCalledTimes(1);
    expect(BattleService.attack).toHaveBeenCalledWith({
      userId: USER,
      attackType: "skill",
      roundId: "2",
      rawDamage: 300,
      jobKey: "swordman",
      cost: 5,
      exp: 123,
    });
  });

  it("does not let negative or NaN bonuses make attack values invalid", async () => {
    RPGCharacter.make.mockReturnValue(character({ standard: 10 }));
    EquipmentService.getEquipmentBonuses.mockResolvedValue({
      atk_percent: -3,
      cost_reduction: Number.NaN,
      exp_bonus: Number.NaN,
    });

    await AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" });

    expect(BattleService.attack).toHaveBeenCalledWith(
      expect.objectContaining({
        rawDamage: 10,
        jobKey: "swordman",
        cost: 10,
        exp: 120,
      })
    );
  });

  it("uses a level-one adventurer without creating missing minigame progress", async () => {
    MinigameService.findByUserId.mockResolvedValue(null);
    RPGCharacter.make.mockReturnValue(character({ standard: 20 }));

    await AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" });

    expect(RPGCharacter.make).toHaveBeenCalledWith("adventurer", { level: 1 });
    expect(MinigameService.createByUserId).not.toHaveBeenCalled();
  });

  it("reserves the 5 second Redis NX cooldown before doing any work", async () => {
    await AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" });

    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, token, options] = redis.set.mock.calls[0];
    expect(key).toBe(`worldboss-v2:${USER}`);
    expect(options).toEqual({ EX: 5, NX: true });
    // The value is an ownership token, not a constant: release must be a
    // compare-and-delete so a late release cannot wipe a successor's reservation.
    expect(typeof token).toBe("string");
    expect(token).not.toHaveLength(0);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("uses a distinct cooldown token per attempt", async () => {
    await AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" });
    await AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" });

    expect(redis.set.mock.calls[0][1]).not.toBe(redis.set.mock.calls[1][1]);
  });

  it("fails with ATTACK_COOLDOWN and no work when the NX reservation misses", async () => {
    redis.set.mockResolvedValue(null);

    await expect(
      AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" })
    ).rejects.toMatchObject({ code: "ATTACK_COOLDOWN" });
    expect(MinigameService.findByUserId).not.toHaveBeenCalled();
    expect(BattleService.attack).not.toHaveBeenCalled();
  });

  it("rethrows a Redis failure instead of disabling the cooldown guard", async () => {
    const failure = new Error("redis unavailable");
    redis.set.mockRejectedValue(failure);

    await expect(
      AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" })
    ).rejects.toBe(failure);
    expect(BattleService.attack).not.toHaveBeenCalled();
  });

  it("never precomputes the daily quota — the transaction is the only authority", async () => {
    // The BattleService mock deliberately exposes no getRemainingDailyCost, so a
    // reintroduced precheck would throw TypeError here instead of passing quietly.
    expect(BattleService.getRemainingDailyCost).toBeUndefined();

    await expect(
      AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" })
    ).resolves.toMatchObject({ result: result() });
    expect(BattleService.attack).toHaveBeenCalledTimes(1);
  });

  it("propagates the service's own race-safe daily rejection", async () => {
    BattleService.attack.mockRejectedValue(error("DAILY_LIMIT_EXCEEDED"));

    await expect(
      AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" })
    ).rejects.toMatchObject({ code: "DAILY_LIMIT_EXCEEDED" });
  });

  it.each(["ROUND_STALE", "ROUND_CLEARED", "DAILY_LIMIT_EXCEEDED"])(
    "gives the cooldown back on %s so the next legitimate tap is not blocked",
    async code => {
      BattleService.attack.mockRejectedValue(error(code));

      await expect(
        AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" })
      ).rejects.toMatchObject({ code });

      const token = redis.set.mock.calls[0][1];
      expect(redis.eval).toHaveBeenCalledTimes(1);
      const [script, args] = redis.eval.mock.calls[0];
      // Compare-and-delete on our own token, never a bare DEL.
      expect(script).toMatch(/GET/);
      expect(script).toMatch(/DEL/);
      expect(args).toEqual({ keys: [`worldboss-v2:${USER}`], arguments: [token] });
    }
  );

  it.each(["ROUND_NOT_FOUND", "NO_ACTIVE_SEASON", "SEASON_ENDED", "INVALID_MAX_HP"])(
    "keeps the cooldown on %s, which a legitimate client cannot reach",
    async code => {
      BattleService.attack.mockRejectedValue(error(code));

      await expect(
        AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" })
      ).rejects.toMatchObject({ code });
      expect(redis.eval).not.toHaveBeenCalled();
    }
  );

  it("keeps the cooldown on a non-domain failure", async () => {
    BattleService.attack.mockRejectedValue(new Error("deadlock found"));

    await expect(
      AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" })
    ).rejects.toThrow("deadlock found");
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("still reports the domain error when the cooldown release itself fails", async () => {
    const warn = jest.spyOn(DefaultLogger, "warn").mockImplementation(() => {});
    redis.eval.mockRejectedValue(new Error("redis unavailable"));
    BattleService.attack.mockRejectedValue(error("ROUND_CLEARED"));

    await expect(
      AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" })
    ).rejects.toMatchObject({ code: "ROUND_CLEARED" });
    expect(warn).toHaveBeenCalledWith(
      "[world-boss-attack] cooldown release failed",
      expect.objectContaining({ key: `worldboss-v2:${USER}` })
    );
    warn.mockRestore();
  });

  it("never releases the cooldown after a successful attack", async () => {
    await AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" });

    expect(redis.eval).not.toHaveBeenCalled();
  });

  it.each(["ROUND_NOT_FOUND", "ROUND_STALE", "ROUND_CLEARED", "NO_ACTIVE_SEASON"])(
    "propagates %s so the transport can map it, and queues nothing",
    async code => {
      BattleService.attack.mockRejectedValue(error(code));

      await expect(
        AttackService.attack({ userId: USER, roundId: 2, attackType: "standard", groupId: GROUP })
      ).rejects.toMatchObject({ code });
      expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
    }
  );

  it("returns the attack result, latest reward and announcement flag", async () => {
    const reward = { rewardId: 9, seasonName: "春季" };
    SeasonService.getLatestSettledResult.mockResolvedValue(reward);

    const response = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
    });

    expect(response).toEqual({
      result: result(),
      announcementQueued: false,
      latestReward: reward,
    });
    expect(AchievementEngine.evaluate).toHaveBeenCalledWith(USER, "boss_attack", {
      feature: "world_boss",
    });
  });

  it("keeps the attack successful when achievement evaluation and reward lookup fail", async () => {
    AchievementEngine.evaluate.mockRejectedValue(new Error("achievement down"));
    SeasonService.getLatestSettledResult.mockRejectedValue(new Error("reward down"));

    const response = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
    });

    expect(response.result).toEqual(result());
    expect(response.latestReward).toBeNull();
  });
});

describe("WorldBossAttackService — announcement gating", () => {
  const cleared = { cleared: true };

  it("enqueues a single-boss clear when the client groupId matches the server's record", async () => {
    const response = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
      displayName: "  漢城  ",
    });

    expect(redis.get).not.toHaveBeenCalled();
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
    expect(response.announcementQueued).toBe(false);

    BattleService.attack.mockResolvedValue(result(cleared));
    const clearedResponse = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
      displayName: "  漢城  ",
    });

    expect(redis.get).toHaveBeenCalledWith(`CHAT_USER_LAST_GROUP_${USER}`);
    expect(broadcastQueue.pushEvent).toHaveBeenCalledTimes(1);
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(GROUP, {
      type: "world_boss_clear",
      userId: USER,
      text: "⚔️ 漢城 擊破了第 3 輪 2 號王「冰狼」！",
      payload: { cycleNo: 3, position: 2, cycleAdvanced: false },
    });
    expect(clearedResponse.announcementQueued).toBe(true);
    expectReplyOnlyDelivery();
  });

  it("enqueues exactly one full-clear announcement when the cycle advanced", async () => {
    BattleService.attack.mockResolvedValue(result({ cleared: true, cycleAdvanced: true }));

    const response = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
      displayName: "漢城",
    });

    expect(broadcastQueue.pushEvent).toHaveBeenCalledTimes(1);
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(GROUP, {
      type: "world_boss_clear",
      userId: USER,
      text: "🎊 漢城 擊破第 3 輪最後一隻王「2 號 冰狼」，本周回五王全滅！",
      payload: { cycleNo: 3, position: 2, cycleAdvanced: true },
    });
    expect(response.announcementQueued).toBe(true);
  });

  it("never puts private state in the public announcement text", async () => {
    BattleService.attack.mockResolvedValue(
      result({
        cleared: true,
        seasonTotalDamage: "987654",
        daily: { limit: 100, used: 42, remaining: 58 },
        levelResult: { levelUp: true, newLevel: 12 },
      })
    );

    await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
      displayName: "漢城",
    });

    const { text, payload } = broadcastQueue.pushEvent.mock.calls[0][1];
    expect(text).toContain("漢城");
    expect(text).toContain("冰狼");
    expect(text).toContain("第 3 輪");
    for (const forbidden of ["987654", "42", "58", "額度", "EXP", "Lv.", "女神石", "獎勵"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(Object.keys(payload)).toEqual(["cycleNo", "position", "cycleAdvanced"]);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["a user id", `U${"a".repeat(32)}`],
    ["a room id", ROOM],
    ["a short id", "Cabc"],
    ["uppercase hex", `C${"A".repeat(32)}`],
    ["a different group", OTHER_GROUP],
  ])("does not enqueue when the client groupId is %s, but still succeeds", async (_l, groupId) => {
    BattleService.attack.mockResolvedValue(result(cleared));

    const response = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId,
      displayName: "漢城",
    });

    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
    expect(response.announcementQueued).toBe(false);
    expect(response.result.cleared).toBe(true);
  });

  it("does not announce into a room even when it is the user's last known source", async () => {
    // Rooms are out of scope for the world boss board; matching the server's
    // record must not be enough to make a room a valid destination.
    redis.get.mockResolvedValue(ROOM);
    BattleService.attack.mockResolvedValue(result(cleared));

    const response = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: ROOM,
      displayName: "漢城",
    });

    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
    expect(response.announcementQueued).toBe(false);
  });

  it("never falls back to the last known group when the client named none", async () => {
    redis.get.mockResolvedValue(GROUP);
    BattleService.attack.mockResolvedValue(result(cleared));

    await AttackService.attack({ userId: USER, roundId: 2, attackType: "standard" });

    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("does not enqueue when the server has no record of a last group", async () => {
    redis.get.mockResolvedValue(null);
    BattleService.attack.mockResolvedValue(result(cleared));

    const response = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
    });

    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
    expect(response.announcementQueued).toBe(false);
  });

  it("does not enqueue for a normal, non-clearing hit", async () => {
    await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
    });

    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("keeps the attack successful and observable when the queue push fails", async () => {
    const warn = jest.spyOn(DefaultLogger, "warn").mockImplementation(() => {});
    broadcastQueue.pushEvent.mockRejectedValue(new Error("redis LPUSH failed"));
    BattleService.attack.mockResolvedValue(result(cleared));

    const response = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
    });

    expect(response.result.cleared).toBe(true);
    expect(response.announcementQueued).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "[world-boss-attack] clear announcement failed",
      expect.objectContaining({ userId: USER, roundId: "2" })
    );
    // The warning must not carry credentials or the raw event body.
    expect(JSON.stringify(warn.mock.calls[0])).not.toMatch(/cookie|token|session/i);
    warn.mockRestore();
  });

  it("reports announcementQueued false when the queue silently drops the event", async () => {
    broadcastQueue.pushEvent.mockResolvedValue(false);
    BattleService.attack.mockResolvedValue(result(cleared));

    const response = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
    });

    expect(response.announcementQueued).toBe(false);
  });
});

describe("WorldBossAttackService — display name resolution", () => {
  beforeEach(() => {
    BattleService.attack.mockResolvedValue(result({ cleared: true }));
  });

  it("prefers the trimmed authenticated session name without touching the user table", async () => {
    await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
      displayName: "  漢城  ",
    });

    expect(UserModel.getProfile).not.toHaveBeenCalled();
    expect(broadcastQueue.pushEvent.mock.calls[0][1].text).toContain("漢城");
  });

  it.each([undefined, null, "", "   ", 123])(
    "falls back to the stored display name when the session name is %p",
    async displayName => {
      UserModel.getProfile.mockResolvedValue({ displayName: " 資料庫名 " });

      await AttackService.attack({
        userId: USER,
        roundId: 2,
        attackType: "standard",
        groupId: GROUP,
        displayName,
      });

      expect(UserModel.getProfile).toHaveBeenCalledWith(USER);
      expect(broadcastQueue.pushEvent.mock.calls[0][1].text).toContain("資料庫名");
    }
  );

  it.each([
    ["no row", null],
    ["a blank name", { displayName: "  " }],
  ])("falls back to 未知玩家 when the user table returns %s", async (_l, profile) => {
    UserModel.getProfile.mockResolvedValue(profile);

    await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
    });

    expect(broadcastQueue.pushEvent.mock.calls[0][1].text).toContain("未知玩家");
  });

  it("falls back to 未知玩家 rather than failing when the user lookup throws", async () => {
    UserModel.getProfile.mockRejectedValue(new Error("db down"));

    const response = await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
    });

    expect(broadcastQueue.pushEvent.mock.calls[0][1].text).toContain("未知玩家");
    expect(response.announcementQueued).toBe(true);
  });

  it("never calls a LINE profile API to resolve a name", async () => {
    UserModel.getProfile.mockResolvedValue(null);

    await AttackService.attack({
      userId: USER,
      roundId: 2,
      attackType: "standard",
      groupId: GROUP,
    });

    expect(mockLineClient.pushMessage).not.toHaveBeenCalled();
    expect(Object.keys(mockLineClient)).not.toContain("getGroupMemberProfile");
    expectReplyOnlyDelivery();
  });
});
