const mockLineClient = {
  getGroupMemberProfile: jest.fn(),
  getProfile: jest.fn(),
  pushMessage: jest.fn(),
  multicast: jest.fn(),
  broadcast: jest.fn(),
  replyMessage: jest.fn(),
  reply: jest.fn(),
};

jest.mock("bottender", () => ({
  getClient: jest.fn(() => mockLineClient),
  chain: jest.fn(),
  withProps: (handler, providedProps) => (context, props) =>
    handler(context, { ...props, ...providedProps }),
  Context: jest.fn(),
  LineContext: jest.fn(),
}));
jest.mock("bottender/router", () => jest.requireActual("bottender/router"));
jest.mock("../../../templates/application/Job", () => ({}));
jest.mock("../../../controller/application/OpenaiController", () => ({
  recordSession: jest.fn(),
}));
jest.mock("../../../service/WorldBossBattleService", () => ({
  attack: jest.fn(),
  getRemainingDailyCost: jest.fn(),
}));
jest.mock("../../../service/WorldBossSeasonService", () => ({
  getBattleStatus: jest.fn(),
  getLatestSettledResult: jest.fn(),
}));
jest.mock("../../../service/MinigameService", () => ({
  findByUserId: jest.fn(),
  createByUserId: jest.fn(),
}));
jest.mock("../../../service/EquipmentService", () => ({
  getEquipmentBonuses: jest.fn(),
}));
jest.mock("../../../model/application/RPGCharacter", () => ({
  make: jest.fn(),
}));
jest.mock("../../../templates/application/WorldBoss", () => ({
  generateWorldBossReply: jest.fn(),
  generateAttackResultBubble: jest.fn(),
}));
jest.mock("../../../templates/common", () => ({
  getLiffUri: jest.fn(),
}));
jest.mock("../../../util/redis", () => ({
  set: jest.fn(),
  incr: jest.fn(),
}));
jest.mock("../../../service/AchievementEngine", () => ({
  evaluate: jest.fn(),
}));
jest.mock("../../../service/achievementNotifier", () => ({
  notifyUnlocks: jest.fn(),
}));

const BattleService = require("../../../service/WorldBossBattleService");
const SeasonService = require("../../../service/WorldBossSeasonService");
const MinigameService = require("../../../service/MinigameService");
const EquipmentService = require("../../../service/EquipmentService");
const RPGCharacter = require("../../../model/application/RPGCharacter");
const WorldBossTemplate = require("../../../templates/application/WorldBoss");
const commonTemplate = require("../../../templates/common");
const redis = require("../../../util/redis");
const AchievementEngine = require("../../../service/AchievementEngine");
const { notifyUnlocks } = require("../../../service/achievementNotifier");
const Controller = require("../WorldBossController");
const { HandlePostback } = require("../../../app");

const activeStatus = {
  season: { id: 1, name: "夏日討伐" },
  round: { id: 2, round_no: 1, max_hp: 1000, current_hp: 800 },
  boss: { id: 3, name: "炎龍", description: "測試王" },
  ended: false,
};
const latestReward = {
  rewardId: 9,
  seasonName: "春季討伐",
  ranking: 51,
  totalDamage: 0,
  stoneAmount: 0,
  titleName: null,
  paidAt: "2026-07-20T00:00:00.000Z",
};
const daily = { limit: 100, used: 0, remaining: 100 };
const attackResult = {
  damage: 100,
  cost: 10,
  seasonTotalDamage: 100,
  daily: { limit: 100, used: 10, remaining: 90 },
  clearedRounds: [],
  levelResult: { levelUp: false },
};

function context(userId = "Uworldboss") {
  return {
    event: { source: { userId } },
    replyText: jest.fn(),
    replyFlex: jest.fn(),
  };
}

function expectReplyOnlyDelivery() {
  expect(mockLineClient.pushMessage).not.toHaveBeenCalled();
  expect(mockLineClient.multicast).not.toHaveBeenCalled();
  expect(mockLineClient.broadcast).not.toHaveBeenCalled();
}

function character({ standard = 100, skill = 200, skillCost = 7 } = {}) {
  return {
    getStandardDamage: jest.fn(() => standard),
    getSkillOneDamage: jest.fn(() => skill),
    skillOne: { cost: skillCost },
  };
}

function error(code) {
  return Object.assign(new Error(code), { code });
}

function postbackContext(action, userId = "Uworldboss", cooldown = 1) {
  return {
    event: {
      isPayload: true,
      payload: JSON.stringify({ action, attackType: "standard", cooldown }),
      source: { userId },
    },
    replyText: jest.fn(),
    replyFlex: jest.fn(),
  };
}

async function runPostback(context) {
  let next = await HandlePostback(context, { next: jest.fn() });
  while (typeof next === "function") next = await next(context, {});
}

beforeEach(() => {
  jest.clearAllMocks();
  SeasonService.getBattleStatus.mockResolvedValue(activeStatus);
  SeasonService.getLatestSettledResult.mockResolvedValue(null);
  BattleService.getRemainingDailyCost.mockResolvedValue(daily);
  BattleService.attack.mockResolvedValue(attackResult);
  MinigameService.findByUserId.mockResolvedValue({ level: 4, job_key: "swordman" });
  EquipmentService.getEquipmentBonuses.mockResolvedValue({
    atk_percent: 0,
    cost_reduction: 0,
    exp_bonus: 0,
  });
  RPGCharacter.make.mockReturnValue(character());
  redis.set.mockResolvedValue("OK");
  redis.incr.mockResolvedValue();
  commonTemplate.getLiffUri.mockReturnValue("https://liff.example/worldboss");
  WorldBossTemplate.generateWorldBossReply.mockReturnValue({ type: "world-reply" });
  WorldBossTemplate.generateAttackResultBubble.mockReturnValue({ type: "attack-reply" });
  AchievementEngine.evaluate.mockResolvedValue({ unlocked: [] });
  notifyUnlocks.mockResolvedValue();
});

describe("WorldBossController.showBattleStatus", () => {
  it("shows active battle and latest reward together on the next command", async () => {
    SeasonService.getLatestSettledResult.mockResolvedValue(latestReward);
    const ctx = context();

    await Controller.showBattleStatus(ctx);

    expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalledWith({
      status: activeStatus,
      daily,
      latestReward,
      liffUri: "https://liff.example/worldboss",
    });
    expect(ctx.replyFlex).toHaveBeenCalledWith("世界王", { type: "world-reply" });
    expectReplyOnlyDelivery();
  });

  it("shows a zero-tier settled reward when no season is active", async () => {
    SeasonService.getBattleStatus.mockResolvedValue(null);
    SeasonService.getLatestSettledResult.mockResolvedValue(latestReward);
    const ctx = context();

    await Controller.showBattleStatus(ctx);

    expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalledWith(
      expect.objectContaining({ status: null, latestReward })
    );
    expect(WorldBossTemplate.generateWorldBossReply.mock.calls[0][0].latestReward).toMatchObject({
      ranking: 51,
      stoneAmount: 0,
      titleName: null,
      rewardId: 9,
      paidAt: "2026-07-20T00:00:00.000Z",
    });
    expect(ctx.replyFlex).toHaveBeenCalledWith("世界王", { type: "world-reply" });
  });

  it("shows the no-season card when neither a battle nor reward exists", async () => {
    SeasonService.getBattleStatus.mockResolvedValue(null);
    SeasonService.getLatestSettledResult.mockResolvedValue(null);
    const ctx = context();

    await Controller.showBattleStatus(ctx);

    expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalledWith(
      expect.objectContaining({ status: null, latestReward: null })
    );
    expect(ctx.replyFlex).toHaveBeenCalledWith("世界王", { type: "world-reply" });
  });
});

describe("World Boss postback wiring", () => {
  it("bypasses the generic guard so the controller sends its v2 cooldown reply", async () => {
    redis.set.mockResolvedValue(null);
    const ctx = postbackContext("worldBossAttack");

    await runPostback(ctx);

    expect(redis.set).toHaveBeenCalledWith("worldboss-v2:Uworldboss", 1, {
      EX: 5,
      NX: true,
    });
    expect(redis.set).not.toHaveBeenCalledWith(
      "Postback_Uworldboss_worldBossAttack",
      1,
      expect.anything()
    );
    expect(ctx.replyText).toHaveBeenCalledWith("攻擊冷卻中，請稍候再試。");
  });

  it("keeps the generic postback guard for other actions", async () => {
    redis.set.mockResolvedValue(null);
    const ctx = postbackContext("janken", "Ulegacy", 7);

    await runPostback(ctx);

    expect(redis.set).toHaveBeenCalledWith("Postback_Ulegacy_janken", 1, {
      EX: 7,
      NX: true,
    });
    expect(ctx.replyText).not.toHaveBeenCalled();
  });
});

describe("WorldBossController.attackOnBoss", () => {
  it("rejects an invalid attack type before calculating damage or calling a service", async () => {
    const ctx = context();

    await Controller.attackOnBoss(ctx, { payload: { attackType: "ultimate" } });

    expect(ctx.replyText).toHaveBeenCalledWith(expect.any(String));
    expect(redis.set).not.toHaveBeenCalled();
    expect(RPGCharacter.make).not.toHaveBeenCalled();
    expect(BattleService.attack).not.toHaveBeenCalled();
  });

  it("uses the v2 Redis NX cooldown before calling the attack service", async () => {
    const ctx = context("Ucooldown");

    await Controller.attackOnBoss(ctx, { payload: { attackType: "standard" } });

    expect(redis.set).toHaveBeenCalledWith("worldboss-v2:Ucooldown", 1, {
      EX: 5,
      NX: true,
    });
    expect(BattleService.attack).toHaveBeenCalledTimes(1);
  });

  it("returns a friendly reply without damage or service work when cooldown NX misses", async () => {
    redis.set.mockResolvedValue(null);
    const ctx = context();

    await Controller.attackOnBoss(ctx, { payload: { attackType: "standard" } });

    expect(ctx.replyText).toHaveBeenCalledWith(expect.any(String));
    expect(MinigameService.findByUserId).not.toHaveBeenCalled();
    expect(RPGCharacter.make).not.toHaveBeenCalled();
    expect(BattleService.attack).not.toHaveBeenCalled();
  });

  it("rethrows a Redis failure instead of disabling the cooldown guard", async () => {
    const redisFailure = new Error("redis unavailable");
    redis.set.mockRejectedValue(redisFailure);

    await expect(
      Controller.attackOnBoss(context(), { payload: { attackType: "standard" } })
    ).rejects.toBe(redisFailure);
    expect(BattleService.attack).not.toHaveBeenCalled();
  });

  it("can short-circuit a daily precheck without replacing the service authority", async () => {
    BattleService.getRemainingDailyCost.mockResolvedValue({ limit: 100, used: 100, remaining: 0 });
    const ctx = context();

    await Controller.attackOnBoss(ctx, { payload: { attackType: "standard" } });

    expect(ctx.replyText).toHaveBeenCalledWith("今日行動額度不足，請明天再來挑戰。");
    expect(BattleService.attack).not.toHaveBeenCalled();
  });

  it("maps a race-safe DAILY_LIMIT_EXCEEDED result from the service to a friendly reply", async () => {
    BattleService.attack.mockRejectedValue(error("DAILY_LIMIT_EXCEEDED"));
    const ctx = context();

    await Controller.attackOnBoss(ctx, { payload: { attackType: "standard" } });

    expect(ctx.replyText).toHaveBeenCalledWith("今日行動額度不足，請明天再來挑戰。");
  });

  it("passes the LIFF URI and latest reward to the attack reply", async () => {
    SeasonService.getLatestSettledResult.mockResolvedValue(latestReward);
    const ctx = context();

    await Controller.attackOnBoss(ctx, { payload: { attackType: "standard" } });

    expect(WorldBossTemplate.generateAttackResultBubble).toHaveBeenCalledWith({
      result: attackResult,
      daily: attackResult.daily,
      latestReward,
      liffUri: "https://liff.example/worldboss",
    });
    expect(ctx.replyFlex).toHaveBeenCalledWith("世界王攻擊", { type: "attack-reply" });
    expectReplyOnlyDelivery();
  });

  it("uses standard damage, fixed base cost, and equipment bonuses exactly", async () => {
    const standardCharacter = character({ standard: 100, skill: 999, skillCost: 7 });
    RPGCharacter.make.mockReturnValue(standardCharacter);
    MinigameService.findByUserId.mockResolvedValue({ level: 8, job_key: "mage" });
    EquipmentService.getEquipmentBonuses.mockResolvedValue({
      atk_percent: 0.25,
      cost_reduction: 2,
      exp_bonus: 5,
    });
    const ctx = context();

    await Controller.attackOnBoss(ctx, { payload: { attackType: "standard" } });

    expect(RPGCharacter.make).toHaveBeenCalledWith("mage", { level: 8 });
    expect(standardCharacter.getStandardDamage).toHaveBeenCalledTimes(1);
    expect(standardCharacter.getSkillOneDamage).not.toHaveBeenCalled();
    expect(BattleService.attack).toHaveBeenCalledWith({
      userId: "Uworldboss",
      attackType: "standard",
      damage: 125,
      cost: 8,
      exp: 125,
    });
    expect(AchievementEngine.evaluate).toHaveBeenCalledWith("Uworldboss", "boss_attack", {
      feature: "world_boss",
    });
    expect(notifyUnlocks).toHaveBeenCalledWith(ctx, "Uworldboss", []);
  });

  it("uses skill damage and skill cost with equipment bonuses exactly", async () => {
    const skillCharacter = character({ standard: 99, skill: 200, skillCost: 7 });
    RPGCharacter.make.mockReturnValue(skillCharacter);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({
      atk_percent: 0.5,
      cost_reduction: 2,
      exp_bonus: 3,
    });

    await Controller.attackOnBoss(context(), { payload: { attackType: "skill" } });

    expect(skillCharacter.getStandardDamage).not.toHaveBeenCalled();
    expect(skillCharacter.getSkillOneDamage).toHaveBeenCalledTimes(1);
    expect(BattleService.attack).toHaveBeenCalledWith({
      userId: "Uworldboss",
      attackType: "skill",
      damage: 300,
      cost: 5,
      exp: 123,
    });
  });

  it("does not let negative or NaN bonuses make attack values invalid", async () => {
    const safeCharacter = character({ standard: 10 });
    RPGCharacter.make.mockReturnValue(safeCharacter);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({
      atk_percent: -3,
      cost_reduction: Number.NaN,
      exp_bonus: Number.NaN,
    });

    await Controller.attackOnBoss(context(), { payload: { attackType: "standard" } });

    expect(BattleService.attack).toHaveBeenCalledWith({
      userId: "Uworldboss",
      attackType: "standard",
      damage: 10,
      cost: 10,
      exp: 120,
    });
  });

  it("uses a level-one adventurer without creating missing minigame progress", async () => {
    const defaultCharacter = character({ standard: 20 });
    MinigameService.findByUserId.mockResolvedValue(null);
    RPGCharacter.make.mockReturnValue(defaultCharacter);

    await Controller.attackOnBoss(context(), { payload: { attackType: "standard" } });

    expect(RPGCharacter.make).toHaveBeenCalledWith("adventurer", { level: 1 });
    expect(MinigameService.createByUserId).not.toHaveBeenCalled();
    expect(BattleService.attack).toHaveBeenCalledWith(expect.objectContaining({ damage: 20 }));
  });

  it.each(["NO_ACTIVE_SEASON", "SEASON_ENDED", "NO_ACTIVE_ROUND"])(
    "maps %s to the no-active-season Flex reply",
    async code => {
      BattleService.attack.mockRejectedValue(error(code));
      const ctx = context();

      await Controller.attackOnBoss(ctx, { payload: { attackType: "standard" } });

      expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalled();
      expect(ctx.replyFlex).toHaveBeenCalledWith("世界王", { type: "world-reply" });
    }
  );

  it("rethrows an unexpected attack failure", async () => {
    const unexpectedError = new Error("database connection lost");
    BattleService.attack.mockRejectedValue(unexpectedError);

    await expect(
      Controller.attackOnBoss(context(), { payload: { attackType: "standard" } })
    ).rejects.toBe(unexpectedError);
  });
});
