// jest.mock NOT hoisted (transform:{}). All mocks BEFORE requiring the service.
jest.mock("../../model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
  create: jest.fn(),
}));
jest.mock("config", () => ({
  get: jest.fn(key => {
    if (key === "worldboss.open_hour") return 4;
    if (key === "worldboss.boss_pool") return [101, 102, 103];
    throw new Error(`unexpected config key: ${key}`);
  }),
}));
// settleEvent is unused by createDailyBoss but the service requires it at module load.
jest.mock("../WorldBossSettlementService", () => ({ settleEvent: jest.fn() }));

const WorldBossEvent = require("../../model/application/WorldBossEvent");
const config = require("config");
const Lifecycle = require("../WorldBossLifecycleService");

// Real Date constructor captured before any spy replaces global.Date.
const RealDate = Date;

// Default config.get implementation — restored in beforeEach so per-test overrides don't bleed.
const defaultConfigGet = key => {
  if (key === "worldboss.open_hour") return 4;
  if (key === "worldboss.boss_pool") return [101, 102, 103];
  throw new Error(`unexpected config key: ${key}`);
};

describe("WorldBossLifecycleService.createDailyBoss", () => {
  let nowSpy;

  beforeEach(() => {
    config.get.mockImplementation(defaultConfigGet);
  });

  afterEach(() => {
    if (nowSpy) {
      nowSpy.mockRestore();
      nowSpy = undefined;
    }
    jest.clearAllMocks();
  });

  function freezeNow(hour) {
    const fixed = new RealDate(2026, 5, 20, hour, 0, 0, 0); // 2026-06-20 local
    nowSpy = jest
      .spyOn(global, "Date")
      .mockImplementation((...args) => (args.length ? new RealDate(...args) : fixed));
    global.Date.now = RealDate.now;
  }

  it("returns null and creates nothing when the local hour is not the open hour", async () => {
    freezeNow(9); // 09:00, open hour is 4
    const result = await Lifecycle.createDailyBoss();
    expect(result).toBeNull();
    expect(WorldBossEvent.getActive).not.toHaveBeenCalled();
    expect(WorldBossEvent.create).not.toHaveBeenCalled();
  });

  it("returns null when an active event already exists (no double-open)", async () => {
    freezeNow(4);
    WorldBossEvent.getActive.mockResolvedValue({ id: 77, status: "active" });
    const result = await Lifecycle.createDailyBoss();
    expect(result).toBeNull();
    expect(WorldBossEvent.create).not.toHaveBeenCalled();
  });

  it("returns null when the boss pool is empty", async () => {
    freezeNow(4);
    WorldBossEvent.getActive.mockResolvedValue(null);
    config.get.mockImplementation(key => {
      if (key === "worldboss.open_hour") return 4;
      if (key === "worldboss.boss_pool") return [];
      throw new Error(`unexpected config key: ${key}`);
    });
    const result = await Lifecycle.createDailyBoss();
    expect(result).toBeNull();
    expect(WorldBossEvent.create).not.toHaveBeenCalled();
  });

  it("creates one active event at the open hour, status='active', 24h window, rotated template", async () => {
    freezeNow(4);
    WorldBossEvent.getActive.mockResolvedValue(null);
    WorldBossEvent.create.mockResolvedValue([555]);
    const result = await Lifecycle.createDailyBoss();
    expect(result).toBe(555);
    expect(WorldBossEvent.create).toHaveBeenCalledTimes(1);
    const arg = WorldBossEvent.create.mock.calls[0][0];
    expect(arg.status).toBe("active");
    expect([101, 102, 103]).toContain(arg.world_boss_id);
    // Restore spy before instanceof check so Date refers to the real constructor.
    nowSpy.mockRestore();
    nowSpy = undefined;
    expect(arg.start_time).toBeInstanceOf(Date);
    expect(arg.end_time).toBeInstanceOf(Date);
    // 24h window
    expect(arg.end_time.getTime() - arg.start_time.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("returns null when create resolves an empty insert result", async () => {
    freezeNow(4);
    WorldBossEvent.getActive.mockResolvedValue(null);
    WorldBossEvent.create.mockResolvedValue([]);
    const result = await Lifecycle.createDailyBoss();
    expect(result).toBeNull();
  });
});
