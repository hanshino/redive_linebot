jest.mock("../../../service/WorldBossCombatService", () => ({
  dpsAttack: jest.fn(),
}));
jest.mock("../../../service/WorldBossRoleService", () => ({
  getRole: jest.fn(),
}));
jest.mock("../../../service/MinigameService", () => ({
  findByUserId: jest.fn(),
  createByUserId: jest.fn(),
  defaultData: { level: 1, exp: 0 },
}));
jest.mock("../../../service/AchievementEngine", () => ({
  evaluate: jest.fn(() => Promise.resolve({ unlocked: [] })),
}));
jest.mock("../../../service/achievementNotifier", () => ({
  notifyUnlocks: jest.fn(),
}));

const WorldBossCombatService = require("../../../service/WorldBossCombatService");
const WorldBossRoleService = require("../../../service/WorldBossRoleService");
const minigameService = require("../../../service/MinigameService");
const controller = require("../WorldBossController");

function makeContext({ type = "user" } = {}) {
  return {
    event: {
      isText: true,
      source: {
        type,
        id: 42,
        userId: "U1",
        displayName: "Tester",
        pictureUrl: "http://x/p.png",
        groupId: type === "group" ? "G1" : undefined,
      },
      message: { quoteToken: "qt" },
    },
    state: {},
    replyText: jest.fn(),
    reply: jest.fn(),
    setState: jest.fn(),
  };
}

describe("attackOnBoss DPS routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WorldBossRoleService.getRole.mockResolvedValue("dps");
    minigameService.findByUserId.mockResolvedValue({ level: 50, job_key: "swordman" });
  });

  test("builds canonical attackType from job + delegates to dpsAttack with both ids", async () => {
    WorldBossCombatService.dpsAttack.mockResolvedValue({
      rejected: false,
      damage: 3000,
      contribution: 3000,
      enraged: false,
      didEnrageTrigger: false,
      knockedBatch: [],
      selfKnocked: false,
    });
    const ctx = makeContext({ type: "user" });
    await controller.attackOnBoss(ctx, {
      payload: { worldBossEventId: 7, attackType: "standard" },
    });
    expect(WorldBossCombatService.dpsAttack).toHaveBeenCalledWith({
      platformId: "U1",
      numericUserId: 42,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
  });

  test("rejected (knocked_down) replies immediately and never narrates", async () => {
    WorldBossCombatService.dpsAttack.mockResolvedValue({
      rejected: true,
      reason: "knocked_down",
      damage: 0,
    });
    const ctx = makeContext({ type: "user" });
    await controller.attackOnBoss(ctx, {
      payload: { worldBossEventId: 7, attackType: "standard" },
    });
    expect(ctx.replyText).toHaveBeenCalledTimes(1);
  });

  test("1:1 success replies immediately with damage narration", async () => {
    WorldBossCombatService.dpsAttack.mockResolvedValue({
      rejected: false,
      damage: 3000,
      contribution: 3000,
      enraged: false,
      didEnrageTrigger: false,
      knockedBatch: [],
      selfKnocked: false,
    });
    const ctx = makeContext({ type: "user" });
    await controller.attackOnBoss(ctx, {
      payload: { worldBossEventId: 7, attackType: "standard" },
    });
    expect(ctx.replyText).toHaveBeenCalled();
    const msg = ctx.replyText.mock.calls[0][0];
    expect(String(msg)).toContain("3000");
  });

  test("group enrage-trigger hit emits a one-time immediate enrage announce", async () => {
    WorldBossCombatService.dpsAttack.mockResolvedValue({
      rejected: false,
      damage: 3000,
      contribution: 3000,
      enraged: false,
      didEnrageTrigger: true,
      knockedBatch: ["Ua", "Ub"],
      selfKnocked: false,
    });
    const ctx = makeContext({ type: "group" });
    await controller.attackOnBoss(ctx, {
      payload: { worldBossEventId: 7, attackType: "standard" },
    });
    // at least one immediate replyText for the enrage announce (bypassing the batch)
    expect(ctx.replyText).toHaveBeenCalled();
  });

  test("non-dps role is rejected with a clear message (M9 wires the rest)", async () => {
    WorldBossRoleService.getRole.mockResolvedValue("healer");
    const ctx = makeContext({ type: "user" });
    await controller.attackOnBoss(ctx, {
      payload: { worldBossEventId: 7, attackType: "standard" },
    });
    expect(WorldBossCombatService.dpsAttack).not.toHaveBeenCalled();
    expect(ctx.replyText).toHaveBeenCalledTimes(1);
  });
});
