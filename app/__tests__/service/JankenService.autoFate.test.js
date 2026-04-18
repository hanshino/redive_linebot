// JankenService.autoFateIfEligible + resolveMatch NX-lock unit tests.

jest.mock("config", () => {
  const store = {
    "autoJankenFate.enabled": true,
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
    __reset: () => {
      store["autoJankenFate.enabled"] = true;
    },
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
      expect.objectContaining({ EX: 3600 })
    );
  });

  it("no-ops when feature flag autoJankenFate.enabled is false", async () => {
    config.__setForTest("autoJankenFate.enabled", false);
    const result = await JankenService.autoFateIfEligible("Up2", "match-1", "p2", {
      p1UserId: "Up1",
      p2UserId: "Up2",
    });
    expect(result).toEqual({ eligible: false });
    expect(UserAutoPreference.first).not.toHaveBeenCalled();
    expect(JankenAutoFateLog.create).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
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
