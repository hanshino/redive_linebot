jest.mock("../../model/application/WorldBossLog", () => ({
  getDamageRank: jest.fn(),
  getContributionRank: jest.fn(),
  getRecentAttackers: jest.fn(),
}));
jest.mock("../../model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
}));
jest.mock("../../model/application/WorldBoss", () => ({
  find: jest.fn(),
}));
jest.mock("../WorldBossEventLogService", () => ({
  getRemainHpByEventId: jest.fn(),
}));
jest.mock("../WorldBossConfig", () => ({
  readEnrageThresholdPct: jest.fn(),
  readEnrageRecentMinutes: jest.fn(),
}));
const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
jest.mock("../../util/connection", () => ({
  io: { of: jest.fn(() => ({ to: mockTo })) },
}));

const WorldBossLog = require("../../model/application/WorldBossLog");
const WorldBossEvent = require("../../model/application/WorldBossEvent");
const WorldBoss = require("../../model/application/WorldBoss");
const WorldBossEventLogService = require("../WorldBossEventLogService");
const WorldBossConfig = require("../WorldBossConfig");
const svc = require("../WorldBossBroadcastService");

describe("WorldBossBroadcastService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    WorldBossConfig.readEnrageThresholdPct.mockReturnValue(35);
    WorldBossConfig.readEnrageRecentMinutes.mockReturnValue(10);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("buildSnapshot computes hpPct from boss.hp minus summed damage; phase enrage at/under threshold", async () => {
    // boss.hp 1000, total damage 650 -> remain 350 -> 35% -> at threshold -> enrage
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, world_boss_id: 1, status: "active" });
    WorldBoss.find.mockResolvedValue({ id: 1, hp: 1000, speed: 35 });
    WorldBossEventLogService.getRemainHpByEventId.mockResolvedValue({ total_damage: 650 });
    WorldBossLog.getDamageRank.mockResolvedValue([
      { total_damage: 500, user_id: 1, platform_id: "Ua" },
    ]);
    WorldBossLog.getContributionRank
      .mockResolvedValueOnce([{ total_contribution: 12, user_id: 2, platform_id: "Ub" }]) // healer
      .mockResolvedValueOnce([{ total_contribution: 8, user_id: 3, platform_id: "Uc" }]); // tank
    WorldBossLog.getRecentAttackers.mockResolvedValue([
      { user_id: 1, platform_id: "Ua" },
      { user_id: 2, platform_id: "Ub" },
    ]);

    const snap = await svc.buildSnapshot(7);
    expect(WorldBossEventLogService.getRemainHpByEventId).toHaveBeenCalledWith(7);
    expect(snap.eventId).toBe(7);
    expect(snap.hpPct).toBe(35);
    expect(snap.phase).toBe("enrage");
    expect(snap.boards.dps).toEqual([{ total_damage: 500, user_id: 1, platform_id: "Ua" }]);
    expect(snap.boards.healer).toHaveLength(1);
    expect(snap.boards.tank).toHaveLength(1);
    expect(snap.feed).toHaveLength(2);
    // feed carries platform_id, never a raw numeric id only
    expect(snap.feed[0].platform_id).toBe("Ua");
  });

  it("phase is calm above the threshold", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, world_boss_id: 1, status: "active" });
    WorldBoss.find.mockResolvedValue({ id: 1, hp: 1000, speed: 35 });
    WorldBossEventLogService.getRemainHpByEventId.mockResolvedValue({ total_damage: 100 });
    WorldBossLog.getDamageRank.mockResolvedValue([]);
    WorldBossLog.getContributionRank.mockResolvedValue([]);
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    const snap = await svc.buildSnapshot(7);
    expect(snap.hpPct).toBe(90);
    expect(snap.phase).toBe("calm");
  });

  it("hpPct floors at 0 when summed damage exceeds boss.hp", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, world_boss_id: 1, status: "active" });
    WorldBoss.find.mockResolvedValue({ id: 1, hp: 1000, speed: 35 });
    WorldBossEventLogService.getRemainHpByEventId.mockResolvedValue({ total_damage: 1500 });
    WorldBossLog.getDamageRank.mockResolvedValue([]);
    WorldBossLog.getContributionRank.mockResolvedValue([]);
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    const snap = await svc.buildSnapshot(7);
    expect(snap.hpPct).toBe(0);
    expect(snap.phase).toBe("enrage");
  });

  it("falls back to WorldBossConfig.readEnrageThresholdPct when boss.speed is 0/null", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, world_boss_id: 1, status: "active" });
    // speed=0 triggers config fallback via readEnrageThresholdPct(boss)
    WorldBoss.find.mockResolvedValue({ id: 1, hp: 1000, speed: 0 });
    WorldBossEventLogService.getRemainHpByEventId.mockResolvedValue({ total_damage: 700 }); // 30% remain
    WorldBossLog.getDamageRank.mockResolvedValue([]);
    WorldBossLog.getContributionRank.mockResolvedValue([]);
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    const snap = await svc.buildSnapshot(7);
    expect(snap.hpPct).toBe(30);
    expect(snap.phase).toBe("enrage"); // 30 <= config 35
    expect(WorldBossConfig.readEnrageThresholdPct).toHaveBeenCalled();
  });

  it("buildSnapshot returns an empty snapshot when no active boss", async () => {
    WorldBossEvent.getActive.mockResolvedValue(null);
    const snap = await svc.buildSnapshot(7);
    expect(snap).toEqual({
      eventId: 7,
      hpPct: 0,
      phase: "calm",
      boards: { dps: [], healer: [], tank: [] },
      feed: [],
    });
    expect(WorldBossEventLogService.getRemainHpByEventId).not.toHaveBeenCalled();
  });

  it("requestBroadcast coalesces a burst into ONE emit after the debounce window", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, world_boss_id: 1, status: "active" });
    WorldBoss.find.mockResolvedValue({ id: 1, hp: 1000, speed: 35 });
    WorldBossEventLogService.getRemainHpByEventId.mockResolvedValue({ total_damage: 500 });
    WorldBossLog.getDamageRank.mockResolvedValue([]);
    WorldBossLog.getContributionRank.mockResolvedValue([]);
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);

    const p1 = svc.requestBroadcast(7);
    svc.requestBroadcast(7);
    svc.requestBroadcast(7); // three calls in the same window -> one scheduled flush
    expect(mockEmit).not.toHaveBeenCalled(); // not yet — still debouncing

    jest.advanceTimersByTime(300); // > debounce window (250ms)
    await p1; // awaitable flush

    expect(mockTo).toHaveBeenCalledWith("wb:7");
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("snapshot", expect.objectContaining({ eventId: 7 }));
  });

  it("emitEnrage fires a one-shot enrage event (platformId batch) to the room", () => {
    svc.emitEnrage(7, ["Ua", "Ub"]);
    expect(mockTo).toHaveBeenCalledWith("wb:7");
    expect(mockEmit).toHaveBeenCalledWith("enrage", { eventId: 7, knockedBatch: ["Ua", "Ub"] });
  });
});
