// jest.mock NOT hoisted (transform:{}). All mocks BEFORE requiring the service.
jest.mock("../../model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
  create: jest.fn(),
  getKilledUnsettled: jest.fn(),
  getOverdueActive: jest.fn(),
  casStatus: jest.fn(),
}));
jest.mock("config", () => ({
  get: jest.fn(key => {
    if (key === "worldboss.open_hour") return 4;
    if (key === "worldboss.boss_pool") return [101];
    throw new Error(`unexpected config key: ${key}`);
  }),
}));
jest.mock("../WorldBossSettlementService", () => ({
  settleEvent: jest.fn(() => Promise.resolve()),
}));

const WorldBossEvent = require("../../model/application/WorldBossEvent");
const settlement = require("../WorldBossSettlementService");
const Lifecycle = require("../WorldBossLifecycleService");

describe("WorldBossLifecycleService.advance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WorldBossEvent.getKilledUnsettled.mockResolvedValue([]);
    WorldBossEvent.getOverdueActive.mockResolvedValue([]);
    WorldBossEvent.casStatus.mockResolvedValue(true);
  });

  it("settles every killed-unsettled event (no CAS — kill CAS already happened on the fatal hit)", async () => {
    WorldBossEvent.getKilledUnsettled.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    const result = await Lifecycle.advance();
    expect(settlement.settleEvent).toHaveBeenCalledWith(10);
    expect(settlement.settleEvent).toHaveBeenCalledWith(11);
    // killed path must NOT touch casStatus
    expect(WorldBossEvent.casStatus).not.toHaveBeenCalled();
    expect(result.settledKilled).toBe(2);
  });

  it("expires an overdue active event via casStatus(active->expired,{}) then settles it", async () => {
    WorldBossEvent.getOverdueActive.mockResolvedValue([{ id: 20 }]);
    WorldBossEvent.casStatus.mockResolvedValue(true);
    const result = await Lifecycle.advance();
    expect(WorldBossEvent.casStatus).toHaveBeenCalledWith(20, "active", "expired", {});
    expect(settlement.settleEvent).toHaveBeenCalledWith(20);
    expect(result.expired).toBe(1);
  });

  it("does NOT settle an overdue event whose expire-CAS it lost (another tick won)", async () => {
    WorldBossEvent.getOverdueActive.mockResolvedValue([{ id: 30 }]);
    WorldBossEvent.casStatus.mockResolvedValue(false);
    const result = await Lifecycle.advance();
    expect(WorldBossEvent.casStatus).toHaveBeenCalledWith(30, "active", "expired", {});
    expect(settlement.settleEvent).not.toHaveBeenCalled();
    expect(result.expired).toBe(0);
  });

  it("expire CAS passes empty extra — never killed_at:null and never settled_at", async () => {
    WorldBossEvent.getOverdueActive.mockResolvedValue([{ id: 40 }]);
    await Lifecycle.advance();
    const extra = WorldBossEvent.casStatus.mock.calls[0][3];
    expect(extra).toEqual({});
    expect(extra).not.toHaveProperty("killed_at");
    expect(extra).not.toHaveProperty("settled_at");
  });

  it("one settleEvent rejection does not abort the rest of the killed batch", async () => {
    WorldBossEvent.getKilledUnsettled.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    settlement.settleEvent.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce();
    const result = await Lifecycle.advance();
    expect(settlement.settleEvent).toHaveBeenCalledTimes(2);
    expect(result.settledKilled).toBe(1); // only the successful one counted
  });
});
