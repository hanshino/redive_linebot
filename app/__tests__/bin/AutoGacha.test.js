// AutoGacha cron — unit tests covering concurrency cap, per-user success /
// already_pulled / failed / expired paths, and per-mode draw selection with
// best-effort stone fallback.

jest.mock("config", () => {
  const store = {
    "autoGacha.concurrency": 2,
    "autoGacha.schedule": ["0", "50", "23", "*", "*", "*"],
    "gacha.pick_up_cost": 1500,
    "gacha.ensure_cost": 3000,
    "gacha.europe_cost": 10000,
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
jest.mock("../../src/model/princess/gacha", () => ({
  getUserGodStoneCount: jest.fn(),
}));
jest.mock("../../src/model/princess/GachaBanner", () => ({
  getActiveBannersWithCharacters: jest.fn(),
}));

const config = require("config");
const mysql = require("../../src/util/mysql");
const GachaService = require("../../src/service/GachaService");
const SubscriptionService = require("../../src/service/SubscriptionService");
const GachaModel = require("../../src/model/princess/gacha");
const GachaBanner = require("../../src/model/princess/GachaBanner");
const AutoGacha = require("../../bin/AutoGacha");

function makeResult(overrides = {}) {
  return {
    rewards: new Array(10).fill({ id: 1, star: "1" }),
    rareCount: { 1: 10 },
    newCharacters: [],
    ownCharactersCount: 50,
    repeatReward: 10,
    godStoneCost: 0,
    unlocks: [],
    ...overrides,
  };
}

describe("AutoGacha cron", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.__reset();
    SubscriptionService.hasEffect.mockResolvedValue(true);
    mysql.first.mockResolvedValue(null);
    GachaService.getRemainingDailyQuota.mockResolvedValue({ total: 1, used: 0, remaining: 1 });
    GachaService.runDailyDraw.mockResolvedValue(makeResult());
    GachaModel.getUserGodStoneCount.mockResolvedValue(100000);
    GachaBanner.getActiveBannersWithCharacters.mockResolvedValue([]);
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
    expect(typeof args[6]).toBe("string");
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
    expect(args[3]).toBe(20);
    const summary = JSON.parse(args[6]);
    expect(summary.rareCount).toEqual({ 1: 20 });
    expect(summary.repeatReward).toBe(20);
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

  describe("mode selection", () => {
    it("mode=normal does not read stone balance and calls runDailyDraw with empty opts", async () => {
      const counters = { success: 0, failed: 0, skipped: 0 };
      await AutoGacha.drawForUser(
        { user_id: "Unorm", auto_daily_gacha_mode: "normal" },
        "2026-04-18",
        counters
      );
      expect(GachaModel.getUserGodStoneCount).not.toHaveBeenCalled();
      expect(GachaService.runDailyDraw).toHaveBeenCalledTimes(1);
      expect(GachaService.runDailyDraw).toHaveBeenCalledWith("Unorm", {});
      const summary = JSON.parse(mysql.raw.mock.calls[0][1][6]);
      expect(summary.mode_requested).toBe("normal");
      expect(summary.mode_breakdown).toEqual({ normal: 1, pickup: 0, ensure: 0, europe: 0 });
      expect(summary.fallback_reason).toBeNull();
    });

    it("mode=ensure with abundant stones runs every round in ensure mode", async () => {
      GachaService.getRemainingDailyQuota.mockResolvedValueOnce({
        total: 2,
        used: 0,
        remaining: 2,
      });
      GachaModel.getUserGodStoneCount.mockResolvedValue(10000);
      const counters = { success: 0, failed: 0, skipped: 0 };
      await AutoGacha.drawForUser(
        { user_id: "Uens", auto_daily_gacha_mode: "ensure" },
        "2026-04-18",
        counters
      );
      expect(GachaService.runDailyDraw).toHaveBeenCalledTimes(2);
      expect(GachaService.runDailyDraw).toHaveBeenNthCalledWith(1, "Uens", { ensure: true });
      expect(GachaService.runDailyDraw).toHaveBeenNthCalledWith(2, "Uens", { ensure: true });
      const summary = JSON.parse(mysql.raw.mock.calls[0][1][6]);
      expect(summary.mode_requested).toBe("ensure");
      expect(summary.mode_breakdown).toEqual({ normal: 0, pickup: 0, ensure: 2, europe: 0 });
      expect(summary.fallback_reason).toBeNull();
    });

    it("mode=ensure degrades round 2 to normal when stones drop below the ensure cost", async () => {
      GachaService.getRemainingDailyQuota.mockResolvedValueOnce({
        total: 2,
        used: 0,
        remaining: 2,
      });
      // Round 1: 3000 stones (covers one ensure). Round 2: 0 stones (forces normal fallback).
      GachaModel.getUserGodStoneCount.mockResolvedValueOnce(3000).mockResolvedValueOnce(0);
      const counters = { success: 0, failed: 0, skipped: 0 };
      await AutoGacha.drawForUser(
        { user_id: "Umix", auto_daily_gacha_mode: "ensure" },
        "2026-04-18",
        counters
      );
      expect(GachaService.runDailyDraw).toHaveBeenCalledTimes(2);
      expect(GachaService.runDailyDraw).toHaveBeenNthCalledWith(1, "Umix", { ensure: true });
      expect(GachaService.runDailyDraw).toHaveBeenNthCalledWith(2, "Umix", {});
      expect(GachaModel.getUserGodStoneCount).toHaveBeenCalledTimes(2);
      const summary = JSON.parse(mysql.raw.mock.calls[0][1][6]);
      expect(summary.mode_breakdown).toEqual({ normal: 1, pickup: 0, ensure: 1, europe: 0 });
      expect(summary.fallback_reason).toBe("insufficient_stone");
    });

    it("mode=europe with no active europe banner falls back to normal for the whole day", async () => {
      GachaService.getRemainingDailyQuota.mockResolvedValueOnce({
        total: 2,
        used: 0,
        remaining: 2,
      });
      const counters = { success: 0, failed: 0, skipped: 0 };
      await AutoGacha.drawForUser(
        { user_id: "Ueuro", auto_daily_gacha_mode: "europe" },
        "2026-04-18",
        counters,
        { activeEuropeBanner: null }
      );
      // All rounds in normal → no stone reads at all
      expect(GachaModel.getUserGodStoneCount).not.toHaveBeenCalled();
      expect(GachaService.runDailyDraw).toHaveBeenCalledTimes(2);
      expect(GachaService.runDailyDraw).toHaveBeenNthCalledWith(1, "Ueuro", {});
      expect(GachaService.runDailyDraw).toHaveBeenNthCalledWith(2, "Ueuro", {});
      const summary = JSON.parse(mysql.raw.mock.calls[0][1][6]);
      expect(summary.mode_requested).toBe("europe");
      expect(summary.mode_breakdown).toEqual({ normal: 2, pickup: 0, ensure: 0, europe: 0 });
      expect(summary.fallback_reason).toBe("europe_unavailable");
    });

    it("mode=europe with active banner uses banner.cost for the stone check", async () => {
      GachaService.getRemainingDailyQuota.mockResolvedValueOnce({
        total: 1,
        used: 0,
        remaining: 1,
      });
      // banner.cost=5000 takes precedence over the 10000 config default.
      GachaModel.getUserGodStoneCount.mockResolvedValue(5000);
      const counters = { success: 0, failed: 0, skipped: 0 };
      await AutoGacha.drawForUser(
        { user_id: "Ubanner", auto_daily_gacha_mode: "europe" },
        "2026-04-18",
        counters,
        { activeEuropeBanner: { id: 1, type: "europe", cost: 5000 } }
      );
      expect(GachaService.runDailyDraw).toHaveBeenCalledWith("Ubanner", { europe: true });
      const summary = JSON.parse(mysql.raw.mock.calls[0][1][6]);
      expect(summary.mode_breakdown.europe).toBe(1);
      expect(summary.fallback_reason).toBeNull();
    });

    it("mode=europe with active banner but insufficient stones falls back per round with insufficient_stone", async () => {
      GachaService.getRemainingDailyQuota.mockResolvedValueOnce({
        total: 1,
        used: 0,
        remaining: 1,
      });
      GachaModel.getUserGodStoneCount.mockResolvedValue(1000);
      const counters = { success: 0, failed: 0, skipped: 0 };
      await AutoGacha.drawForUser(
        { user_id: "Upoor", auto_daily_gacha_mode: "europe" },
        "2026-04-18",
        counters,
        { activeEuropeBanner: { id: 1, type: "europe", cost: 5000 } }
      );
      expect(GachaService.runDailyDraw).toHaveBeenCalledWith("Upoor", {});
      const summary = JSON.parse(mysql.raw.mock.calls[0][1][6]);
      expect(summary.mode_requested).toBe("europe");
      expect(summary.mode_breakdown.europe).toBe(0);
      expect(summary.mode_breakdown.normal).toBe(1);
      expect(summary.fallback_reason).toBe("insufficient_stone");
    });

    it("unknown / missing stored mode is coerced to 'normal'", async () => {
      const counters = { success: 0, failed: 0, skipped: 0 };
      await AutoGacha.drawForUser(
        { user_id: "Ugarbage", auto_daily_gacha_mode: "legendary" },
        "2026-04-18",
        counters
      );
      expect(GachaService.runDailyDraw).toHaveBeenCalledWith("Ugarbage", {});
      const summary = JSON.parse(mysql.raw.mock.calls[0][1][6]);
      expect(summary.mode_requested).toBe("normal");
    });

    it("costForMode honours banner.cost precedence over config default", () => {
      expect(AutoGacha.costForMode("normal", null)).toBe(0);
      expect(AutoGacha.costForMode("pickup", null)).toBe(1500);
      expect(AutoGacha.costForMode("ensure", null)).toBe(3000);
      expect(AutoGacha.costForMode("europe", null)).toBe(10000);
      expect(AutoGacha.costForMode("europe", { cost: 0 })).toBe(10000);
      expect(AutoGacha.costForMode("europe", { cost: 7777 })).toBe(7777);
    });
  });
});
