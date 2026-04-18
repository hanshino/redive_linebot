// JankenService.autoFateIfEligible + resolveMatch NX-lock unit tests.

jest.mock("config", () => {
  const store = {
    "redis.keys.jankenDecide": "jankenDecide",
    "redis.keys.jankenChallenge": "jankenChallenge",
    "minigame.janken.bet.feeRate": 0.1,
    "minigame.janken.bet.minAmount": 10,
    "minigame.janken.streak.bountyMinBet": 1000,
    "minigame.janken.streak.bountyClaimMultiplier": 5,
  };
  return {
    get: jest.fn(key => store[key]),
    has: jest.fn(key => key in store),
    __setForTest: (k, v) => {
      store[k] = v;
    },
    __reset: () => {},
  };
});

jest.mock("../../src/model/application/UserAutoPreference", () => ({
  first: jest.fn(),
}));
jest.mock("../../src/model/application/JankenAutoFateLog", () => ({
  create: jest.fn(),
}));
jest.mock("../../src/service/SubscriptionService", () => ({
  hasEffect: jest.fn(),
}));

jest.mock("../../src/model/application/Inventory", () => ({
  inventory: {
    getUserMoney: jest.fn(),
    decreaseGodStone: jest.fn().mockResolvedValue(undefined),
    increaseGodStone: jest.fn().mockResolvedValue(undefined),
  },
}));

const config = require("config");
const redis = require("../../src/util/redis");
const UserAutoPreference = require("../../src/model/application/UserAutoPreference");
const JankenAutoFateLog = require("../../src/model/application/JankenAutoFateLog");
const SubscriptionService = require("../../src/service/SubscriptionService");
const JankenService = require("../../src/service/JankenService");

describe("JankenService.autoFateIfEligible", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.__reset();
    redis.set.mockResolvedValue("OK");
    redis.get.mockResolvedValue(null);
    UserAutoPreference.first.mockResolvedValue({ user_id: "Up2", auto_janken_fate: 1 });
    SubscriptionService.hasEffect.mockResolvedValue(true);
    JankenAutoFateLog.create.mockResolvedValue(1);
  });

  it("auto-submits a choice and writes a log row when user is eligible and opted-in", async () => {
    const result = await JankenService.autoFateIfEligible("Up2", "match-1", "p2", {
      p1UserId: "Up1",
      p2UserId: "Up2",
    });
    expect(result.eligible).toBe(true);
    expect(["rock", "paper", "scissors"]).toContain(result.choice);
    expect(JankenAutoFateLog.create).toHaveBeenCalledWith({
      match_id: "match-1",
      user_id: "Up2",
      role: "p2",
      choice: result.choice,
    });
    // submitChoice writes to redis under jankenDecide:{matchId}:{userId}
    expect(redis.set).toHaveBeenCalledWith(
      "jankenDecide:match-1:Up2",
      result.choice,
      expect.objectContaining({ EX: 7 * 24 * 60 * 60 })
    );
  });

  it("no-ops when user has no preference row", async () => {
    UserAutoPreference.first.mockResolvedValueOnce(null);
    const result = await JankenService.autoFateIfEligible("Up2", "match-1", "p2", {
      p1UserId: "Up1",
      p2UserId: "Up2",
    });
    expect(result.eligible).toBe(false);
    expect(JankenAutoFateLog.create).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("no-ops when user opted out (auto_janken_fate = 0)", async () => {
    UserAutoPreference.first.mockResolvedValueOnce({ user_id: "Up2", auto_janken_fate: 0 });
    const result = await JankenService.autoFateIfEligible("Up2", "match-1", "p2", {
      p1UserId: "Up1",
      p2UserId: "Up2",
    });
    expect(result.eligible).toBe(false);
    expect(JankenAutoFateLog.create).not.toHaveBeenCalled();
  });

  it("no-ops when user lacks the auto_janken_fate subscription entitlement", async () => {
    SubscriptionService.hasEffect.mockResolvedValueOnce(false);
    const result = await JankenService.autoFateIfEligible("Up2", "match-1", "p2", {
      p1UserId: "Up1",
      p2UserId: "Up2",
    });
    expect(result.eligible).toBe(false);
    expect(JankenAutoFateLog.create).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  describe("bet-mode auto-fate (fund-leak safety)", () => {
    it("bet match: skips when auto_janken_fate_with_bet is not opted in", async () => {
      UserAutoPreference.first.mockResolvedValueOnce({
        user_id: "Up2",
        auto_janken_fate: 1,
        auto_janken_fate_with_bet: 0,
      });
      const result = await JankenService.autoFateIfEligible("Up2", "match-b", "p2", {
        p1UserId: "Up1",
        p2UserId: "Up2",
        betAmount: 100,
      });
      expect(result).toEqual({ eligible: false, reason: "bet_auto_fate_not_opted_in" });
      expect(JankenAutoFateLog.create).not.toHaveBeenCalled();
      // Confirm submitChoice was never called.
      expect(redis.set.mock.calls.some(c => String(c[0]).startsWith("jankenDecide:match-b:"))).toBe(
        false
      );
    });

    it("bet match: escrow fails (insufficient funds) → skip auto-fate, no log, no submit", async () => {
      UserAutoPreference.first.mockResolvedValueOnce({
        user_id: "Up2",
        auto_janken_fate: 1,
        auto_janken_fate_with_bet: 1,
      });
      // First redis.set is tryEscrowOnce's NX lock acquiring → "OK"; escrowBet then
      // calls inventory.getUserMoney which returns insufficient balance.
      const { inventory } = require("../../src/model/application/Inventory");
      inventory.getUserMoney.mockResolvedValueOnce({ amount: 10 });
      redis.set.mockResolvedValue("OK"); // escrow NX succeeds

      const result = await JankenService.autoFateIfEligible("Up2", "match-b2", "p2", {
        p1UserId: "Up1",
        p2UserId: "Up2",
        betAmount: 1000,
      });
      expect(result).toEqual({ eligible: false, reason: "insufficient_funds_for_bet" });
      expect(JankenAutoFateLog.create).not.toHaveBeenCalled();
      expect(inventory.decreaseGodStone).not.toHaveBeenCalled();
    });

    it("bet match: with_bet=1 and escrow succeeds → proceed with auto-fate", async () => {
      UserAutoPreference.first.mockResolvedValueOnce({
        user_id: "Up2",
        auto_janken_fate: 1,
        auto_janken_fate_with_bet: 1,
      });
      const { inventory } = require("../../src/model/application/Inventory");
      inventory.getUserMoney.mockResolvedValueOnce({ amount: 10000 });
      redis.set.mockResolvedValue("OK");

      const result = await JankenService.autoFateIfEligible("Up2", "match-b3", "p2", {
        p1UserId: "Up1",
        p2UserId: "Up2",
        betAmount: 1000,
      });
      expect(result.eligible).toBe(true);
      expect(["rock", "paper", "scissors"]).toContain(result.choice);
      expect(inventory.decreaseGodStone).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "Up2", amount: 1000, note: "janken_bet_escrow" })
      );
      expect(JankenAutoFateLog.create).toHaveBeenCalled();
    });
  });
});

describe("JankenService.resolveMatch NX lock (AC-12)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.set.mockResolvedValue("OK");
  });

  it("second concurrent call returns null because NX lock is held", async () => {
    // First call acquires the lock (redis.set with NX returns "OK"), second returns null.
    redis.set.mockImplementationOnce(async () => "OK").mockImplementationOnce(async () => null);

    const params = {
      matchId: "m",
      groupId: "G",
      p1UserId: "Up1",
      p2UserId: "Up2",
      p1Choice: "rock",
      p2Choice: "paper",
      betAmount: 0,
    };

    // Intentionally trigger a failure after the lock check so the first call short-circuits
    // (we only care about the lock semantics here). The second call must see the lock held.
    const call1 = JankenService.resolveMatch(params).catch(() => null);
    const call2 = JankenService.resolveMatch(params);

    await call1;
    const result2 = await call2;
    expect(result2).toBeNull();
  });
});
