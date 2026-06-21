// jest.mock NOT hoisted (transform:{}). Mock the lifecycle service BEFORE requiring the cron entry.
jest.mock("../../src/service/WorldBossLifecycleService", () => ({
  createDailyBoss: jest.fn(() => Promise.resolve(null)),
  advance: jest.fn(() => Promise.resolve({ settledKilled: 0, expired: 0 })),
}));

const Lifecycle = require("../../src/service/WorldBossLifecycleService");
const WorldBossAdvance = require("../WorldBossAdvance");

describe("bin/WorldBossAdvance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls createDailyBoss then advance once per tick", async () => {
    await WorldBossAdvance();
    expect(Lifecycle.createDailyBoss).toHaveBeenCalledTimes(1);
    expect(Lifecycle.advance).toHaveBeenCalledTimes(1);
  });

  it("calls createDailyBoss before advance (open before reconcile)", async () => {
    const order = [];
    Lifecycle.createDailyBoss.mockImplementation(() => {
      order.push("create");
      return Promise.resolve(null);
    });
    Lifecycle.advance.mockImplementation(() => {
      order.push("advance");
      return Promise.resolve({ settledKilled: 0, expired: 0 });
    });
    await WorldBossAdvance();
    expect(order).toEqual(["create", "advance"]);
  });

  it("does not throw when createDailyBoss rejects (still runs advance)", async () => {
    Lifecycle.createDailyBoss.mockRejectedValue(new Error("open failed"));
    await expect(WorldBossAdvance()).resolves.toBeUndefined();
    expect(Lifecycle.advance).toHaveBeenCalledTimes(1);
  });

  it("does not throw when advance rejects", async () => {
    Lifecycle.advance.mockRejectedValue(new Error("advance failed"));
    await expect(WorldBossAdvance()).resolves.toBeUndefined();
  });
});
