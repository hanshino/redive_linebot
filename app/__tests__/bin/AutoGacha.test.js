// AutoGacha cron — unit tests covering concurrency cap and per-user
// success / already_pulled / failed / expired paths.

jest.mock("config", () => {
  const store = {
    "autoGacha.concurrency": 2,
    "autoGacha.schedule": ["0", "50", "23", "*", "*", "*"],
  };
  return {
    get: jest.fn(key => store[key]),
    has: jest.fn(key => key in store),
    __setForTest: (k, v) => {
      store[k] = v;
    },
    __reset: () => {
      store["autoGacha.concurrency"] = 2;
    },
  };
});

jest.mock("../../src/service/GachaService", () => ({
  runDailyDraw: jest.fn(),
  getRemainingDailyQuota: jest.fn(),
}));
jest.mock("../../src/service/SubscriptionService", () => ({
  hasEffect: jest.fn(),
}));

const config = require("config");
const mysql = require("../../src/util/mysql");
const GachaService = require("../../src/service/GachaService");
const SubscriptionService = require("../../src/service/SubscriptionService");
const AutoGacha = require("../../bin/AutoGacha");

describe("AutoGacha cron", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.__reset();
    SubscriptionService.hasEffect.mockResolvedValue(true);
    mysql.first.mockResolvedValue(null);
    GachaService.getRemainingDailyQuota.mockResolvedValue({ total: 1, used: 0, remaining: 1 });
    GachaService.runDailyDraw.mockResolvedValue({
      rewards: new Array(10).fill({ id: 1, star: "1" }),
      rareCount: { 1: 10 },
      newCharacters: [],
      ownCharactersCount: 50,
      repeatReward: 10,
      godStoneCost: 0,
      unlocks: [],
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("runBatched respects the concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const worker = jest.fn(async () => {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
    });
    const items = Array.from({ length: 10 }, (_, i) => ({ user_id: `U${i}` }));
    await AutoGacha.runBatched(items, 3, worker);
    expect(worker).toHaveBeenCalledTimes(10);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("drawForUser logs a success row with reward_summary when GachaService resolves", async () => {
    const counters = { success: 0, failed: 0, skipped: 0 };
    await AutoGacha.drawForUser({ user_id: "Usucc" }, "2026-04-18", counters);
    expect(counters.success).toBe(1);
    expect(mysql.raw).toHaveBeenCalledTimes(1);
    const [sql, args] = mysql.raw.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO auto_gacha_job_log/);
    expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
    expect(args[0]).toBe("Usucc");
    expect(args[1]).toBe("2026-04-18");
    expect(args[2]).toBe("success");
    expect(args[3]).toBe(10);
    expect(typeof args[6]).toBe("string"); // reward_summary JSON stringified
    const summary = JSON.parse(args[6]);
    expect(summary.rareCount).toEqual({ 1: 10 });
    expect(summary.repeatReward).toBe(10);
    expect(summary.rounds).toBe(1);
  });

  it("drawForUser loops runDailyDraw once per remaining quota slot (month-card = 2 rounds)", async () => {
    GachaService.getRemainingDailyQuota.mockResolvedValueOnce({ total: 2, used: 0, remaining: 2 });
    const counters = { success: 0, failed: 0, skipped: 0 };
    await AutoGacha.drawForUser({ user_id: "Umonth" }, "2026-04-18", counters);
    expect(GachaService.runDailyDraw).toHaveBeenCalledTimes(2);
    expect(counters.success).toBe(1);
    const args = mysql.raw.mock.calls[0][1];
    expect(args[2]).toBe("success");
    expect(args[3]).toBe(20); // 2 rounds × 10 pulls each
    const summary = JSON.parse(args[6]);
    expect(summary.rareCount).toEqual({ 1: 20 });
    expect(summary.repeatReward).toBe(20); // 10 per round × 2 rounds
    expect(summary.rounds).toBe(2);
    expect(summary.quota_total).toBe(2);
  });

  it("drawForUser logs skipped / already_pulled when quota is exhausted", async () => {
    GachaService.getRemainingDailyQuota.mockResolvedValueOnce({ total: 1, used: 1, remaining: 0 });
    const counters = { success: 0, failed: 0, skipped: 0 };
    await AutoGacha.drawForUser({ user_id: "Upulled" }, "2026-04-18", counters);
    expect(counters.skipped).toBe(1);
    expect(GachaService.runDailyDraw).not.toHaveBeenCalled();
    const args = mysql.raw.mock.calls[0][1];
    expect(args[2]).toBe("skipped");
    expect(args[4]).toBe("already_pulled");
  });

  it("drawForUser logs skipped when subscription expired between load and draw", async () => {
    SubscriptionService.hasEffect.mockResolvedValueOnce(false);
    const counters = { success: 0, failed: 0, skipped: 0 };
    await AutoGacha.drawForUser({ user_id: "Uexp" }, "2026-04-18", counters);
    expect(counters.skipped).toBe(1);
    expect(GachaService.runDailyDraw).not.toHaveBeenCalled();
    const args = mysql.raw.mock.calls[0][1];
    expect(args[2]).toBe("skipped");
    expect(args[4]).toBe("subscription_expired_between_load_and_draw");
  });

  it("drawForUser logs failed with truncated error when GachaService throws", async () => {
    const longMsg = "x".repeat(400);
    GachaService.runDailyDraw.mockRejectedValueOnce(new Error(longMsg));
    const counters = { success: 0, failed: 0, skipped: 0 };
    await AutoGacha.drawForUser({ user_id: "Ufail" }, "2026-04-18", counters);
    expect(counters.failed).toBe(1);
    const args = mysql.raw.mock.calls[0][1];
    expect(args[2]).toBe("failed");
    expect(args[4].length).toBe(255);
    expect(args[4]).toBe("x".repeat(255));
  });

  it("summarizeRewards normalizes a single GachaService result into a reward summary shape", () => {
    const out = AutoGacha.summarizeRewards({
      rareCount: { 1: 7, 2: 2, 3: 1 },
      newCharacters: [{ id: 1 }, { id: 2 }],
      godStoneCost: 1500,
      repeatReward: 50,
    });
    expect(out).toMatchObject({
      rareCount: { 1: 7, 2: 2, 3: 1 },
      newCharactersCount: 2,
      godStoneCost: 1500,
      repeatReward: 50,
      rounds: 1,
    });
  });
});
