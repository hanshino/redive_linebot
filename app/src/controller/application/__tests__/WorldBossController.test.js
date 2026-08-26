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
jest.mock("../../../controller/application/OpenaiController", () => ({ recordSession: jest.fn() }));
jest.mock("../../../service/WorldBossBattleService", () => ({
  attack: jest.fn(),
  getRemainingDailyCost: jest.fn(),
}));
jest.mock("../../../service/WorldBossSeasonService", () => ({
  getBattleStatus: jest.fn(),
  getLatestSettledResult: jest.fn(),
}));
jest.mock("../../../service/WorldBossAttackService", () => ({ attack: jest.fn() }));
jest.mock("../../../templates/application/WorldBoss", () => ({
  generateWorldBossReply: jest.fn(),
}));
jest.mock("../../../templates/common", () => ({ getLiffUri: jest.fn() }));
jest.mock("../../../util/redis", () => ({
  set: jest.fn(),
  get: jest.fn(),
  incr: jest.fn(),
}));

const BattleService = require("../../../service/WorldBossBattleService");
const SeasonService = require("../../../service/WorldBossSeasonService");
const AttackService = require("../../../service/WorldBossAttackService");
const WorldBossTemplate = require("../../../templates/application/WorldBoss");
const commonTemplate = require("../../../templates/common");
const redis = require("../../../util/redis");
const Controller = require("../WorldBossController");
const { HandlePostback } = require("../../../app");

const activeStatus = {
  season: { id: 1, name: "夏日討伐" },
  cycleNo: 1,
  rounds: [1, 2, 3, 4, 5].map(position => ({
    id: position + 1,
    cycle_no: 1,
    position,
    max_hp: 1000,
    current_hp: 800,
    name: `王${position}`,
  })),
  ended: false,
};

function context(userId = "Uworldboss", type = "user", guildConfig) {
  return {
    event: { source: { userId, type, groupId: "Cgroup" } },
    ...(guildConfig === undefined ? {} : { state: { guildConfig } }),
    replyText: jest.fn(),
    replyFlex: jest.fn(),
  };
}

function postbackContext(action, userId = "Uworldboss", cooldown = 1, extra = {}, type = "group") {
  return {
    event: {
      isPayload: true,
      payload: JSON.stringify({ action, attackType: "standard", cooldown, ...extra }),
      source: { userId, type, groupId: "Cgroup" },
    },
    state: { guildConfig: { WorldBossAttack: "Y" } },
    replyText: jest.fn(),
    replyFlex: jest.fn(),
  };
}

async function runPostback(ctx) {
  let next = await HandlePostback(ctx, { next: jest.fn() });
  while (typeof next === "function") next = await next(ctx, {});
}

function error(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function attackResult(overrides = {}) {
  return {
    effectiveDamage: "12345",
    attackedCycleNo: 3,
    cleared: false,
    cycleAdvanced: false,
    round: { current_hp: "500", max_hp: "1000" },
    boss: { position: 2, name: "炎王" },
    levelResult: { newLevel: 55 },
    daily: { remaining: 77 },
    seasonTotalDamage: "99999999",
    cost: 10,
    ...overrides,
  };
}

function expectReplyOnlyDelivery() {
  expect(mockLineClient.pushMessage).not.toHaveBeenCalled();
  expect(mockLineClient.multicast).not.toHaveBeenCalled();
  expect(mockLineClient.broadcast).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  SeasonService.getBattleStatus.mockResolvedValue(activeStatus);
  redis.set.mockResolvedValue("OK");
  commonTemplate.getLiffUri.mockReturnValue("https://liff.example/worldboss");
  WorldBossTemplate.generateWorldBossReply.mockReturnValue({ type: "world-reply" });
  mockLineClient.getGroupMemberProfile.mockResolvedValue({ displayName: "群組玩家" });
  AttackService.attack.mockResolvedValue({ result: attackResult(), latestReward: null });
});

describe("WorldBossController.showBattleStatus — public board only", () => {
  it("passes attackEnabled false for the default user context", async () => {
    const ctx = context();
    await Controller.showBattleStatus(ctx);
    expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalledWith({
      status: activeStatus,
      liffUri: "https://liff.example/worldboss",
      attackEnabled: false,
    });
    expect(BattleService.getRemainingDailyCost).not.toHaveBeenCalled();
    expect(SeasonService.getLatestSettledResult).not.toHaveBeenCalled();
    expectReplyOnlyDelivery();
  });

  it("enables attack postbacks for a group with the toggle on", async () => {
    await Controller.showBattleStatus(context("Ugroup", "group", { WorldBossAttack: "Y" }));
    expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalledWith(
      expect.objectContaining({ attackEnabled: true })
    );
  });

  it.each(["N", undefined])("keeps attack disabled for group toggle %s", async value => {
    await Controller.showBattleStatus(
      context("Ugroup", "group", value === undefined ? {} : { WorldBossAttack: value })
    );
    expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalledWith(
      expect.objectContaining({ attackEnabled: false })
    );
  });

  it("keeps attack disabled in 1:1 chats even when config is present", async () => {
    await Controller.showBattleStatus(context("Uuser", "user", { WorldBossAttack: "Y" }));
    expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalledWith(
      expect.objectContaining({ attackEnabled: false })
    );
  });

  it("passes a missing season through to the template unchanged", async () => {
    SeasonService.getBattleStatus.mockResolvedValue(null);
    await Controller.showBattleStatus(context(undefined));
    expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalledWith({
      status: null,
      liffUri: "https://liff.example/worldboss",
      attackEnabled: false,
    });
  });
});

describe("worldBossAttack postback — group attack", () => {
  it("silently rejects a 1:1 old card", async () => {
    const ctx = postbackContext("worldBossAttack", "Uuser", 1, { roundId: 2 }, "user");
    await runPostback(ctx);
    expect(ctx.replyText).not.toHaveBeenCalled();
    expect(AttackService.attack).not.toHaveBeenCalled();
    expectReplyOnlyDelivery();
  });

  it("silently rejects a group old card after the toggle was disabled", async () => {
    const ctx = postbackContext("worldBossAttack");
    ctx.state.guildConfig.WorldBossAttack = "N";
    await runPostback(ctx);
    expect(ctx.replyText).not.toHaveBeenCalled();
    expect(AttackService.attack).not.toHaveBeenCalled();
  });

  it("silently handles an undefined state without throwing", async () => {
    const ctx = context("Ugroup", "group");
    await expect(
      Controller.attackOnBoss(ctx, { payload: { roundId: 2, attackType: "standard" } })
    ).resolves.toBeUndefined();
    expect(ctx.replyText).not.toHaveBeenCalled();
    expect(AttackService.attack).not.toHaveBeenCalled();
  });

  it.each([undefined, "heavy"])("silently rejects invalid attack type %s", async attackType => {
    const ctx = postbackContext("worldBossAttack", "Ugroup", 1, { roundId: 2, attackType });
    await Controller.attackOnBoss(ctx, { payload: { roundId: 2, attackType } });
    expect(ctx.replyText).not.toHaveBeenCalled();
    expect(AttackService.attack).not.toHaveBeenCalled();
  });

  it.each(["DAILY_LIMIT_EXCEEDED", "ATTACK_COOLDOWN"])("silently handles %s", async code => {
    AttackService.attack.mockRejectedValue(error(code));
    const ctx = context("Ugroup", "group", { WorldBossAttack: "Y" });
    await Controller.attackOnBoss(ctx, { payload: { roundId: 2, attackType: "standard" } });
    expect(ctx.replyText).not.toHaveBeenCalled();
    expectReplyOnlyDelivery();
  });

  it("attacks with source identity, profile name, and no groupId", async () => {
    const ctx = context("Usource", "group", { WorldBossAttack: "Y" });
    await Controller.attackOnBoss(ctx, { payload: { roundId: 22, attackType: "skill" } });
    expect(AttackService.attack).toHaveBeenCalledWith({
      userId: "Usource",
      roundId: 22,
      attackType: "skill",
      displayName: "群組玩家",
    });
    expect(AttackService.attack.mock.calls[0][0]).not.toHaveProperty("groupId");
    expectReplyOnlyDelivery();
  });

  it("does not trust a malicious payload userId", async () => {
    const ctx = context("Usource", "group", { WorldBossAttack: "Y" });
    await Controller.attackOnBoss(ctx, {
      payload: { roundId: 22, attackType: "standard", userId: "Uattacker" },
    });
    expect(AttackService.attack.mock.calls[0][0].userId).toBe("Usource");
  });

  it("falls back to 未知玩家 when profile lookup fails", async () => {
    mockLineClient.getGroupMemberProfile.mockRejectedValue(new Error("LINE down"));
    const ctx = context("Usource", "group", { WorldBossAttack: "Y" });
    await Controller.attackOnBoss(ctx, { payload: { roundId: 22, attackType: "standard" } });
    expect(AttackService.attack.mock.calls[0][0].displayName).toBe("未知玩家");
  });

  it("replies with public status only and uses effective damage", async () => {
    AttackService.attack.mockResolvedValue({
      result: attackResult({ latestReward: "not-public" }),
      latestReward: { stoneAmount: 100 },
    });
    const ctx = context("Usource", "group", { WorldBossAttack: "Y" });
    await Controller.attackOnBoss(ctx, { payload: { roundId: 22, attackType: "standard" } });
    const reply = ctx.replyText.mock.calls[0][0];
    expect(reply).toContain("群組玩家");
    expect(reply).toContain("12,345");
    expect(reply).toContain("3 輪 2 號王「炎王」剩餘 50%");
    ["99999999", "77", "55", "10", "not-public", "100"].forEach(value =>
      expect(reply).not.toContain(value)
    );
    expectReplyOnlyDelivery();
  });

  it.each([
    [false, "⚔️ 群組玩家 擊破了第 3 輪 2 號王「炎王」！"],
    [true, "🎊 群組玩家 擊破第 3 輪最後一隻王「2 號 炎王」，本周回五王全滅！"],
  ])("uses the correct clear text when cycleAdvanced=%s", async (cycleAdvanced, expected) => {
    AttackService.attack.mockResolvedValue({
      result: attackResult({ cleared: true, cycleAdvanced }),
    });
    const ctx = context("Usource", "group", { WorldBossAttack: "Y" });
    await Controller.attackOnBoss(ctx, { payload: { roundId: 22, attackType: "standard" } });
    expect(ctx.replyText).toHaveBeenCalledWith(expect.stringContaining(expected));
  });

  it.each(["ROUND_CLEARED", "ROUND_STALE"])("reports a cleared boss for %s", async code => {
    AttackService.attack.mockRejectedValue(error(code));
    const ctx = context("Usource", "group", { WorldBossAttack: "Y" });
    await Controller.attackOnBoss(ctx, { payload: { roundId: 22, attackType: "standard" } });
    expect(ctx.replyText).toHaveBeenCalledWith("這隻王已被擊破，請打 #世界王 取得最新戰況");
  });

  it.each(["SEASON_ENDED", "NO_ACTIVE_SEASON", "NO_ACTIVE_ROUND"])(
    "reports season state for %s",
    async code => {
      AttackService.attack.mockRejectedValue(error(code));
      const ctx = context("Usource", "group", { WorldBossAttack: "Y" });
      await Controller.attackOnBoss(ctx, { payload: { roundId: 22, attackType: "standard" } });
      expect(ctx.replyText).toHaveBeenCalledWith("世界王賽季已結束或尚未開始");
    }
  );

  it("silently logs unexpected errors without exposing them", async () => {
    AttackService.attack.mockRejectedValue(error("BOOM", "secret stack details"));
    const ctx = context("Usource", "group", { WorldBossAttack: "Y" });
    await Controller.attackOnBoss(ctx, { payload: { roundId: 22, attackType: "standard" } });
    expect(ctx.replyText).not.toHaveBeenCalled();
    expectReplyOnlyDelivery();
  });

  it("stops at the generic postback guard without calling the controller", async () => {
    redis.set.mockResolvedValue(null);
    const ctx = postbackContext("worldBossAttack");
    await runPostback(ctx);
    expect(redis.set).toHaveBeenCalledWith("Postback_Uworldboss_worldBossAttack", 1, {
      EX: 1,
      NX: true,
    });
    expect(ctx.replyText).not.toHaveBeenCalled();
    expect(AttackService.attack).not.toHaveBeenCalled();
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
