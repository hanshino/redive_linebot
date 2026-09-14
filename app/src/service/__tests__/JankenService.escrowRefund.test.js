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
    lockGodStoneBalance: jest.fn(),
    decreaseGodStone: jest.fn().mockResolvedValue(undefined),
    increaseGodStone: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../model/application/JankenRecords", () => ({
  create: jest.fn().mockResolvedValue(1),
  update: jest.fn().mockResolvedValue(1),
  // refundStaleEscrows 的 durable settled check：預設查無（未結算）
  find: jest.fn().mockResolvedValue(undefined),
  SOURCE: { MANUAL: "manual", ARENA: "arena", AUTO: "auto" },
}));
jest.mock("../../model/application/JankenResult", () => ({
  insert: jest.fn().mockResolvedValue(1),
  resultMap: { win: 1, lose: 2, draw: 3 },
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
    inventory.lockGodStoneBalance.mockResolvedValueOnce(10000);

    const result = await JankenService.escrowBet("Uaaa", 500, "match-1");

    expect(result).toEqual({ success: true });
    // debit 現在帶交易（trx）在鎖讀之後執行，只斷言金額與 note
    expect(inventory.decreaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "Uaaa", amount: 500, note: "janken_bet_escrow" })
    );
    expect(redis.zAdd).toHaveBeenCalledWith(PENDING_KEY, {
      score: expect.any(Number),
      value: "match-1|Uaaa|500",
    });
  });

  it("does not register anything when the balance is insufficient", async () => {
    inventory.lockGodStoneBalance.mockResolvedValueOnce(10);

    const result = await JankenService.escrowBet("Uaaa", 500, "match-1");

    expect(result).toEqual({ success: false, balance: 10 });
    expect(inventory.decreaseGodStone).not.toHaveBeenCalled();
    expect(redis.zAdd).not.toHaveBeenCalled();
  });

  it("reverses the debit when zAdd throws, so stones are never lost untracked", async () => {
    inventory.lockGodStoneBalance.mockResolvedValueOnce(10000);
    redis.zAdd.mockRejectedValueOnce(new Error("redis down"));

    const result = await JankenService.escrowBet("Uaaa", 500, "match-1");

    expect(result).toEqual({ success: false, balance: 10000 });
    // The rollback credit must exactly match the debit.
    // debit 現在帶交易（trx）在鎖讀之後執行，只斷言金額與 note
    expect(inventory.decreaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "Uaaa", amount: 500, note: "janken_bet_escrow" })
    );
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
    inventory.lockGodStoneBalance.mockResolvedValueOnce(10000);
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
    inventory.lockGodStoneBalance.mockResolvedValueOnce(10000);

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

describe("JankenService.tryEscrowOnce releases the lock when the stake fails", () => {
  const LOCK_KEY = "jankenDecide:escrow:m1:Uaaa";

  beforeEach(() => {
    jest.clearAllMocks();
    redis.del.mockResolvedValue(1);
  });

  it("drops the lock when the player cannot afford the bet", async () => {
    redis.set.mockResolvedValueOnce("OK");
    inventory.lockGodStoneBalance.mockResolvedValueOnce(10);

    const result = await JankenService.tryEscrowOnce("m1", "Uaaa", 500);

    expect(result).toEqual({ success: false, balance: 10 });
    expect(redis.del).toHaveBeenCalledWith(LOCK_KEY);
  });

  it("drops the lock when escrowBet rolls back after a zAdd failure", async () => {
    redis.set.mockResolvedValueOnce("OK");
    inventory.lockGodStoneBalance.mockResolvedValueOnce(10000);
    redis.zAdd.mockRejectedValueOnce(new Error("redis down"));

    const result = await JankenService.tryEscrowOnce("m1", "Uaaa", 500);

    expect(result.success).toBe(false);
    expect(redis.del).toHaveBeenCalledWith(LOCK_KEY);
  });

  it("drops the lock and rethrows when escrowBet throws", async () => {
    redis.set.mockResolvedValueOnce("OK");
    inventory.lockGodStoneBalance.mockRejectedValueOnce(new Error("db down"));

    await expect(JankenService.tryEscrowOnce("m1", "Uaaa", 500)).rejects.toThrow("db down");
    expect(redis.del).toHaveBeenCalledWith(LOCK_KEY);
  });

  it("keeps the lock when the stake succeeds (isMatchAlive still works)", async () => {
    redis.set.mockResolvedValueOnce("OK");
    redis.zAdd.mockResolvedValueOnce(1);
    inventory.lockGodStoneBalance.mockResolvedValueOnce(10000);

    const result = await JankenService.tryEscrowOnce("m1", "Uaaa", 500);

    expect(result).toEqual({ success: true });
    expect(redis.del).not.toHaveBeenCalled();
  });

  // The free-ride regression: broke player clicks, is rejected, clicks again. Before the
  // lock was released the retry returned `alreadyEscrowed: true`, which callers treat as
  // "already paid" and pass through to submitChoice — letting them play without staking.
  it("makes a retry re-attempt the debit instead of reporting alreadyEscrowed", async () => {
    redis.set.mockResolvedValueOnce("OK");
    inventory.lockGodStoneBalance.mockResolvedValueOnce(10);
    const first = await JankenService.tryEscrowOnce("m1", "Uaaa", 500);
    expect(first.alreadyEscrowed).toBeUndefined();
    expect(first.success).toBe(false);

    // Lock was deleted, so the NX set succeeds again on the second click.
    redis.set.mockResolvedValueOnce("OK");
    inventory.lockGodStoneBalance.mockResolvedValueOnce(10);
    const second = await JankenService.tryEscrowOnce("m1", "Uaaa", 500);

    expect(second.alreadyEscrowed).toBeUndefined();
    expect(second).toEqual({ success: false, balance: 10 });
    expect(inventory.decreaseGodStone).not.toHaveBeenCalled();
  });

  it("still short-circuits a genuine duplicate of a successful stake", async () => {
    redis.set.mockResolvedValueOnce(null);

    const result = await JankenService.tryEscrowOnce("m1", "Uaaa", 500);

    expect(result).toEqual({ alreadyEscrowed: true });
    expect(inventory.lockGodStoneBalance).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });
});

describe("JankenService.resolveMatch clears pending escrows", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    redis.set.mockResolvedValue("OK");
    redis.del.mockResolvedValue(1);
    redis.zRem.mockResolvedValue(1);
    // 結算 core 走真 knex 鎖讀（forUpdate）與交易，不在共用 mock builder 的模擬範圍；
    // 這裡只驗 wrapper 在 commit 後的 Redis 清理，core 由 JankenService.settleCore.test.js（隔離 DB）覆蓋。
    jest.spyOn(JankenService, "settleMatchInTransaction").mockResolvedValue({
      p1Result: "win",
      p2Result: "lose",
      betFee: 0,
      p1EloChange: 0,
      p2EloChange: 0,
      winnerStreak: 0,
      loserPreviousStreak: 0,
      loserBounty: 0,
    });
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

  // --- Orchestrator 回報的修正項 2：post-commit 副作用各自獨立 catch，不互相牽連、result 一律回傳 ---

  it("zRem 失敗不擋 del，且回傳已 commit 的 result（不是 undefined／拋出）", async () => {
    redis.zRem.mockRejectedValue(new Error("redis zRem down"));

    const result = await JankenService.resolveMatch({
      ...baseParams,
      p1Choice: "rock",
      p2Choice: "scissors",
    });

    // zRem 兩次都失敗，但 del 仍要被嘗試（不因 zRem reject 而被跳過）。
    expect(redis.zRem).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledWith(`jankenDecide:m1:Uaaa`);
    expect(redis.del).toHaveBeenCalledWith(`jankenDecide:m1:Ubbb`);
    // 結算 core 的 result 已經 commit，controller 靠它觸發成就通知——即使清理失敗也必須拿得到。
    expect(result).toMatchObject({ p1Result: "win", p2Result: "lose" });
  });

  it("del 失敗不擋 zRem，且回傳已 commit 的 result", async () => {
    redis.del.mockRejectedValue(new Error("redis del down"));

    const result = await JankenService.resolveMatch({
      ...baseParams,
      p1Choice: "rock",
      p2Choice: "scissors",
    });

    expect(redis.zRem).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ p1Result: "win", p2Result: "lose" });
  });

  it("兩類清理同時失敗：兩者都仍被嘗試、result 仍正確回傳", async () => {
    redis.zRem.mockRejectedValue(new Error("zRem down"));
    redis.del.mockRejectedValue(new Error("del down"));

    const result = await JankenService.resolveMatch({
      ...baseParams,
      p1Choice: "rock",
      p2Choice: "scissors",
    });

    expect(redis.zRem).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ p1Result: "win", p2Result: "lose" });
  });

  it("resolveMatch 不會把 post-commit 副作用的錯誤吞成靜默失敗：settleMatchInTransaction 本身失敗仍要 throw（不是回傳 result 或 null）", async () => {
    // 這是修正項 2 的邊界：只有 commit 之後的清理副作用可以各自 catch；交易本身（結算 core）
    // 失敗必須讓整個 resolveMatch 往外拋，不能被本次修正的「各自 catch」邏輯誤蓋住。
    JankenService.settleMatchInTransaction.mockRejectedValueOnce(new Error("settle core failed"));

    await expect(
      JankenService.resolveMatch({ ...baseParams, p1Choice: "rock", p2Choice: "scissors" })
    ).rejects.toThrow("settle core failed");
    // 交易本身失敗時，不應該進入任何 post-commit 副作用（沒有東西可清理）
    expect(redis.zRem).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("資金只落一次：即使 post-commit 副作用全部失敗，settleMatchInTransaction 仍只被呼叫一次（不因清理失敗而重新結算）", async () => {
    redis.zRem.mockRejectedValue(new Error("zRem down"));
    redis.del.mockRejectedValue(new Error("del down"));
    await JankenService.resolveMatch({ ...baseParams, p1Choice: "rock", p2Choice: "scissors" });

    expect(JankenService.settleMatchInTransaction).toHaveBeenCalledTimes(1);
  });
});
