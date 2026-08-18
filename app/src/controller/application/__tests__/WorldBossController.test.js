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
jest.mock("../../../service/WorldBossAttackService", () => ({ attack: jest.fn() }));
jest.mock("../../../templates/application/WorldBoss", () => ({
  generateWorldBossReply: jest.fn(),
}));
jest.mock("../../../templates/common", () => ({
  getLiffUri: jest.fn(),
}));
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

function postbackContext(action, userId = "Uworldboss", cooldown = 1, extra = {}) {
  return {
    event: {
      isPayload: true,
      payload: JSON.stringify({ action, attackType: "standard", cooldown, ...extra }),
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
  redis.set.mockResolvedValue("OK");
  redis.get.mockResolvedValue(null);
  redis.incr.mockResolvedValue();
  commonTemplate.getLiffUri.mockReturnValue("https://liff.example/worldboss");
  WorldBossTemplate.generateWorldBossReply.mockReturnValue({ type: "world-reply" });
});

describe("WorldBossController.showBattleStatus — public board only", () => {
  it("renders the public board from season status alone, with no personal lookups", async () => {
    const ctx = context();

    await Controller.showBattleStatus(ctx);

    expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalledWith({
      status: activeStatus,
      liffUri: "https://liff.example/worldboss",
    });
    // No quota, no settled reward: nothing that identifies the triggering user.
    expect(BattleService.getRemainingDailyCost).not.toHaveBeenCalled();
    expect(SeasonService.getLatestSettledResult).not.toHaveBeenCalled();
    expect(ctx.replyFlex).toHaveBeenCalledWith("世界王", { type: "world-reply" });
    expectReplyOnlyDelivery();
  });

  it("renders the board even without a resolvable user, since it is not user specific", async () => {
    const ctx = context(undefined);

    await Controller.showBattleStatus(ctx);

    expect(ctx.replyText).not.toHaveBeenCalled();
    expect(ctx.replyFlex).toHaveBeenCalledWith("世界王", { type: "world-reply" });
  });

  it("passes a missing season through to the template unchanged", async () => {
    SeasonService.getBattleStatus.mockResolvedValue(null);
    const ctx = context();

    await Controller.showBattleStatus(ctx);

    expect(WorldBossTemplate.generateWorldBossReply).toHaveBeenCalledWith({
      status: null,
      liffUri: "https://liff.example/worldboss",
    });
    expect(ctx.replyFlex).toHaveBeenCalledWith("世界王", { type: "world-reply" });
  });
});

describe("Retired worldBossAttack postback", () => {
  it("performs no attack and sends no reply for an old card", async () => {
    const ctx = postbackContext("worldBossAttack", "Uworldboss", 5, { roundId: 2 });

    await runPostback(ctx);

    expect(ctx.replyText).not.toHaveBeenCalled();
    expect(ctx.replyFlex).not.toHaveBeenCalled();
    expect(AttackService.attack).not.toHaveBeenCalled();
    expect(BattleService.attack).not.toHaveBeenCalled();
    expectReplyOnlyDelivery();
  });

  it("is silent when called directly with a well-formed legacy payload", async () => {
    const ctx = context();

    await Controller.attackOnBoss(ctx, { payload: { attackType: "standard", roundId: 2 } });

    expect(ctx.replyText).not.toHaveBeenCalled();
    expect(ctx.replyFlex).not.toHaveBeenCalled();
    expect(AttackService.attack).not.toHaveBeenCalled();
    expect(BattleService.attack).not.toHaveBeenCalled();
    // The retired handler must not even reserve the attack cooldown.
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("stops at the generic guard without calling the controller", async () => {
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
