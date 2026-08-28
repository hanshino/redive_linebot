// JankenService escrow timeout-refund tests.
// Core invariant under test: stones are only credited when the pending-set member was
// successfully claimed (zRem === 1). Losing a refund is acceptable; minting is not.

jest.mock("config", () => {
  const store = {
    "redis.keys.jankenDecide": "jankenDecide",
    "redis.keys.jankenChallenge": "jankenChallenge",
    "minigame.janken.bet.feeRate": 0.1,
    "minigame.janken.bet.minAmount": 10,
    "minigame.janken.streak.bountyMinBet": 1000,
    "minigame.janken.streak.bountyClaimMultiplier": 5,
    "minigame.janken.pairDampening.matchesThreshold": 10,
    "minigame.janken.pairDampening.biasMultiplier": 0.1,
    "minigame.janken.elo.nonBetK": 0,
    "minigame.janken.elo.lossFactor": 0.5,
    "minigame.janken.elo.streakBonus": [],
    "minigame.janken.elo.kFactorTiers": [{ minBet: 0, k: 12 }],
  };
  return { get: jest.fn(key => store[key]), has: jest.fn(key => key in store) };
});

jest.mock("../../model/application/Inventory", () => ({
  inventory: {
    getUserMoney: jest.fn(),
    decreaseGodStone: jest.fn().mockResolvedValue(undefined),
    increaseGodStone: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../model/application/JankenRecords", () => ({
  create: jest.fn().mockResolvedValue(1),
  update: jest.fn().mockResolvedValue(1),
}));
jest.mock("../../model/application/JankenResult", () => ({
  insert: jest.fn().mockResolvedValue(1),
  resultMap: { win: 1, lose: 2, draw: 3 },
}));
jest.mock("../../service/EventCenterService", () => ({
  add: jest.fn().mockResolvedValue(undefined),
  getEventName: jest.fn(n => n),
}));

const redis = require("../../util/redis");
const { inventory } = require("../../model/application/Inventory");
const JankenService = require("../JankenService");

const PENDING_KEY = "jankenDecide:escrow:pending";
const HOUR = 60 * 60 * 1000;

describe("JankenService.refundStaleEscrows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.zRangeByScore.mockResolvedValue([]);
    redis.zRem.mockResolvedValue(1);
    redis.del.mockResolvedValue(1);
    inventory.increaseGodStone.mockResolvedValue(undefined);
  });

  it("refunds a stale escrow with the exact userId and amount", async () => {
    redis.zRangeByScore.mockResolvedValueOnce(["match-1|Uaaa|500"]);

    const result = await JankenService.refundStaleEscrows();

    expect(inventory.increaseGodStone).toHaveBeenCalledTimes(1);
    expect(inventory.increaseGodStone).toHaveBeenCalledWith({
      userId: "Uaaa",
      amount: 500,
      note: "janken_bet_timeout_refund",
    });
    expect(result).toEqual({ scanned: 1, refunded: 1, failed: 0 });
  });

  it("scans with a cutoff of now - 2h (threshold > 1h match window)", async () => {
    const before = Date.now();
    await JankenService.refundStaleEscrows();
    const after = Date.now();

    expect(redis.zRangeByScore).toHaveBeenCalledTimes(1);
    const [key, min, max] = redis.zRangeByScore.mock.calls[0];
    expect(key).toBe(PENDING_KEY);
    expect(min).toBe(0);
    expect(max).toBeGreaterThanOrEqual(before - 2 * HOUR);
    expect(max).toBeLessThanOrEqual(after - 2 * HOUR);
  });

  it("NEVER pays out when zRem returns 0 (already claimed/settled elsewhere)", async () => {
    redis.zRangeByScore.mockResolvedValueOnce(["match-1|Uaaa|500"]);
    redis.zRem.mockResolvedValueOnce(0);

    const result = await JankenService.refundStaleEscrows();

    expect(inventory.increaseGodStone).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, refunded: 0, failed: 0 });
  });

  it("claims before paying — zRem is called before increaseGodStone", async () => {
    redis.zRangeByScore.mockResolvedValueOnce(["match-1|Uaaa|500"]);
    const order = [];
    redis.zRem.mockImplementationOnce(async () => {
      order.push("zRem");
      return 1;
    });
    inventory.increaseGodStone.mockImplementationOnce(async () => {
      order.push("pay");
    });

    await JankenService.refundStaleEscrows();

    expect(order).toEqual(["zRem", "pay"]);
  });

  it("does not refund escrows newer than the threshold (they are outside the scan)", async () => {
    // zRangeByScore is bounded by the cutoff, so a fresh escrow simply isn't returned.
    redis.zRangeByScore.mockImplementationOnce(async (_key, _min, max) =>
      // A 10-minute-old escrow scores above the 2h cutoff.
      Date.now() - 10 * 60 * 1000 <= max ? ["match-fresh|Ubbb|300"] : []
    );

    const result = await JankenService.refundStaleEscrows();

    expect(inventory.increaseGodStone).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 0, refunded: 0, failed: 0 });
  });

  it("one failing refund does not abort the rest of the batch", async () => {
    redis.zRangeByScore.mockResolvedValueOnce(["m1|Uaaa|100", "m2|Ubbb|200", "m3|Uccc|300"]);
    inventory.increaseGodStone
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(undefined);

    const result = await JankenService.refundStaleEscrows();

    expect(inventory.increaseGodStone).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ scanned: 3, refunded: 2, failed: 1 });
  });
});

describe("JankenService.escrowBet pending tracking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.zAdd.mockResolvedValue(1);
  });

  it("registers the escrow in the pending set after the ledger debit", async () => {
    inventory.getUserMoney.mockResolvedValueOnce({ amount: 10000 });

    const result = await JankenService.escrowBet("Uaaa", 500, "match-1");

    expect(result).toEqual({ success: true });
    expect(inventory.decreaseGodStone).toHaveBeenCalledWith({
      userId: "Uaaa",
      amount: 500,
      note: "janken_bet_escrow",
    });
    expect(redis.zAdd).toHaveBeenCalledWith(PENDING_KEY, {
      score: expect.any(Number),
      value: "match-1|Uaaa|500",
    });
  });

  it("does not register anything when the balance is insufficient", async () => {
    inventory.getUserMoney.mockResolvedValueOnce({ amount: 10 });

    const result = await JankenService.escrowBet("Uaaa", 500, "match-1");

    expect(result).toEqual({ success: false, balance: 10 });
    expect(inventory.decreaseGodStone).not.toHaveBeenCalled();
    expect(redis.zAdd).not.toHaveBeenCalled();
  });

  it("reverses the debit when zAdd throws, so stones are never lost untracked", async () => {
    inventory.getUserMoney.mockResolvedValueOnce({ amount: 10000 });
    redis.zAdd.mockRejectedValueOnce(new Error("redis down"));

    const result = await JankenService.escrowBet("Uaaa", 500, "match-1");

    expect(result).toEqual({ success: false, balance: 10000 });
    // The rollback credit must exactly match the debit.
    expect(inventory.decreaseGodStone).toHaveBeenCalledWith({
      userId: "Uaaa",
      amount: 500,
      note: "janken_bet_escrow",
    });
    expect(inventory.increaseGodStone).toHaveBeenCalledTimes(1);
    expect(inventory.increaseGodStone).toHaveBeenCalledWith({
      userId: "Uaaa",
      amount: 500,
      note: "janken_bet_escrow_rollback",
    });
    const debited = inventory.decreaseGodStone.mock.calls[0][0].amount;
    const credited = inventory.increaseGodStone.mock.calls[0][0].amount;
    expect(credited).toBe(debited);
  });

  it("leaves no pending member behind on the rollback path", async () => {
    inventory.getUserMoney.mockResolvedValueOnce({ amount: 10000 });
    redis.zAdd.mockRejectedValueOnce(new Error("redis down"));
    redis.zRangeByScore.mockResolvedValueOnce([]);

    await JankenService.escrowBet("Uaaa", 500, "match-1");

    // zAdd rejected, so nothing was ever stored; a subsequent cron pass finds nothing
    // and therefore cannot double-refund the already-reversed escrow.
    const result = await JankenService.refundStaleEscrows();
    expect(result).toEqual({ scanned: 0, refunded: 0, failed: 0 });
    expect(inventory.increaseGodStone).toHaveBeenCalledTimes(1);
  });
});

describe("JankenService.isMatchAlive", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns true while p1's escrow lock is still present", async () => {
    redis.exists.mockResolvedValueOnce(1);

    await expect(JankenService.isMatchAlive("m1", "Uaaa")).resolves.toBe(true);
    expect(redis.exists).toHaveBeenCalledWith("jankenDecide:escrow:m1:Uaaa");
  });

  it("returns false once the lock has expired", async () => {
    redis.exists.mockResolvedValueOnce(0);

    await expect(JankenService.isMatchAlive("m1", "Uaaa")).resolves.toBe(false);
  });

  it("tryEscrowOnce writes the very key isMatchAlive probes (guard is wired correctly)", async () => {
    jest.clearAllMocks();
    redis.set.mockResolvedValueOnce("OK");
    redis.zAdd.mockResolvedValueOnce(1);
    inventory.getUserMoney.mockResolvedValueOnce({ amount: 10000 });

    await JankenService.tryEscrowOnce("m1", "Uaaa", 500);

    // p1's duel path must go through tryEscrowOnce, not bare escrowBet, or the liveness
    // probe would report every bet match as already expired.
    expect(redis.set).toHaveBeenCalledWith(
      "jankenDecide:escrow:m1:Uaaa",
      "1",
      expect.objectContaining({ EX: 60 * 60, NX: true })
    );
  });
});

describe("JankenService.resolveMatch clears pending escrows", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    redis.set.mockResolvedValue("OK");
    redis.del.mockResolvedValue(1);
    redis.zRem.mockResolvedValue(1);
    // Elo/streak run real knex transactions (forUpdate) that the shared mock builder
    // doesn't model; they're covered by JankenService.elo.test.js.
    jest.spyOn(JankenService, "updateElo").mockResolvedValue({ p1EloChange: 0, p2EloChange: 0 });
    jest
      .spyOn(JankenService, "updateStreaks")
      .mockResolvedValue({ winnerStreak: 0, loserPreviousStreak: 0, loserBounty: 0 });
  });

  afterAll(() => jest.restoreAllMocks());

  const baseParams = {
    matchId: "m1",
    groupId: "G1",
    p1UserId: "Uaaa",
    p2UserId: "Ubbb",
    betAmount: 500,
  };

  it("removes both members on a draw (both sides refunded)", async () => {
    await JankenService.resolveMatch({ ...baseParams, p1Choice: "rock", p2Choice: "rock" });

    expect(redis.zRem).toHaveBeenCalledWith(PENDING_KEY, "m1|Uaaa|500");
    expect(redis.zRem).toHaveBeenCalledWith(PENDING_KEY, "m1|Ubbb|500");
  });

  it("removes both members on a decisive result (winner paid)", async () => {
    await JankenService.resolveMatch({ ...baseParams, p1Choice: "rock", p2Choice: "scissors" });

    expect(redis.zRem).toHaveBeenCalledWith(PENDING_KEY, "m1|Uaaa|500");
    expect(redis.zRem).toHaveBeenCalledWith(PENDING_KEY, "m1|Ubbb|500");
  });

  it("does not touch the pending set for a no-bet match", async () => {
    await JankenService.resolveMatch({
      ...baseParams,
      betAmount: 0,
      p1Choice: "rock",
      p2Choice: "scissors",
    });

    expect(redis.zRem).not.toHaveBeenCalled();
  });
});
