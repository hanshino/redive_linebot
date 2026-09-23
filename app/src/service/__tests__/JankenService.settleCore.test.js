// U3 結算 core（KTD3）的真實 DB 證據：pre_escrowed 不二扣、整場 rollback 全部不落地（含 janken_result）、
// duel／arena 回歸、escrowBet 交易內鎖讀、refundStaleEscrows 的 durable settled check。
// 用 worldBossFixture 在本機 Docker MySQL 建拋棄式 DB（Princess_wbtest_*），結束只 DROP 自己。
// Redis／EventCenter 走全域 setup.js 的 mock（不碰任何真 Redis）；DB 交易全部是真的，不 monkeypatch。
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
if (!["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
  throw new Error(`refuse: DB_HOST is not local (${process.env.DB_HOST})`);
}
const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../__tests__/helpers/worldBossFixture");

const testDatabase = createWorldBossTestDatabase("ajm_settle");
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);

const redis = require("../../util/redis");
const JankenService = require("../JankenService");
const JankenResult = require("../../model/application/JankenResult");
const JankenRecords = require("../../model/application/JankenRecords");
const { inventory } = require("../../model/application/Inventory");

jest.setTimeout(60000);

const U = ch => "U" + ch.repeat(32);
const A = U("a");
const B = U("b");
const C = U("c");

async function balance(userId) {
  const row = await mysql("inventory")
    .sum({ amount: "itemAmount" })
    .where({ userId, itemId: 999 })
    .first();
  return Number(row.amount || 0);
}
async function ledger(userId, note) {
  return mysql("inventory").where({ userId, itemId: 999, note }).orderBy("ID");
}
async function grant(userId, amount) {
  await mysql("inventory").insert({ userId, itemId: 999, itemAmount: amount, note: "test_grant" });
}
async function counts(matchId) {
  const [records, results, ratings, pairs] = await Promise.all([
    mysql("janken_records").where({ id: matchId }),
    mysql("janken_result").where({ record_id: matchId }),
    mysql("janken_rating"),
    mysql("janken_pair_stats"),
  ]);
  return {
    records: records.length,
    results: results.length,
    ratings: ratings.length,
    pairs: pairs.length,
  };
}

/** 模擬手動對戰的 escrow（玩家出拳時已扣款）：pre_escrowed 的前提。 */
async function preEscrow(matchId, userId, amount) {
  await inventory.decreaseGodStone({ userId, amount, note: "janken_bet_escrow" });
}

describe("JankenService settlement core (isolated DB)", () => {
  beforeAll(async () => {
    await testDatabase.setup();
    await mysql("user").insert([
      { platform: "line", platform_id: A },
      { platform: "line", platform_id: B },
      { platform: "line", platform_id: C },
    ]);
  }, SETUP_TIMEOUT_MS);
  afterAll(() => testDatabase.teardown());
  beforeEach(() => {
    jest.clearAllMocks();
    redis.set.mockResolvedValue("OK");
  });

  test("duel pre_escrowed 勝負：只 payout 不二扣，records/result/rating/pair_stats 同一 commit，source=manual", async () => {
    await grant(A, 10000);
    await grant(B, 10000);
    await preEscrow("d-win", A, 1000);
    await preEscrow("d-win", B, 1000);

    const result = await JankenService.resolveMatch({
      matchId: "d-win",
      groupId: "G1",
      p1UserId: A,
      p2UserId: B,
      p1Choice: "rock",
      p2Choice: "scissors",
      betAmount: 1000,
    });

    expect(result).toMatchObject({
      p1Result: "win",
      p2Result: "lose",
      betAmount: 1000,
      betFee: 200,
    });
    // 贏家 +1800（2000 - 10% fee），輸家不再被扣：各自只有一筆 escrow 扣款
    expect(await balance(A)).toBe(10000 - 1000 + 1800);
    expect(await balance(B)).toBe(10000 - 1000);
    expect(await ledger(A, "janken_bet_escrow")).toHaveLength(1);
    expect(await ledger(B, "janken_bet_escrow")).toHaveLength(1);
    expect(await ledger(A, "janken_auto_bet")).toHaveLength(0);

    const record = await JankenRecords.find("d-win");
    expect(record).toMatchObject({
      source: "manual",
      bet_amount: 1000,
      bet_fee: 200,
      group_id: "G1",
    });
    expect(record.elo_change).toBeGreaterThan(0);
    const results = await mysql("janken_result").where({ record_id: "d-win" }).orderBy("user_id");
    expect(results.map(r => r.result)).toEqual([
      JankenResult.resultMap.win,
      JankenResult.resultMap.lose,
    ]);
    const ratingA = await mysql("janken_rating").where({ user_id: A }).first();
    const ratingB = await mysql("janken_rating").where({ user_id: B }).first();
    expect(ratingA).toMatchObject({ win_count: 1, streak: 1, last_won_opponent_id: B });
    expect(ratingB).toMatchObject({ lose_count: 1, streak: 0 });
    expect(ratingA.elo).toBeGreaterThan(1000);
    expect(
      await mysql("janken_pair_stats").where({ player_a: A, player_b: B }).first()
    ).toMatchObject({
      matches: 1,
      a_wins: 1,
    });
    // commit 後才做 Redis 清理（escrow member 與出拳 key）
    expect(redis.zRem).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledTimes(2);
  });

  test("duel pre_escrowed 平手：雙方各退一次、fee 0、pair_stats draws+1", async () => {
    const [a0, b0] = [await balance(A), await balance(B)];
    await preEscrow("d-draw", A, 500);
    await preEscrow("d-draw", B, 500);
    const result = await JankenService.resolveMatch({
      matchId: "d-draw",
      groupId: "G1",
      p1UserId: A,
      p2UserId: B,
      p1Choice: "paper",
      p2Choice: "paper",
      betAmount: 500,
    });
    expect(result).toMatchObject({ p1Result: "draw", betFee: 0, p1EloChange: 0 });
    expect(await balance(A)).toBe(a0);
    expect(await balance(B)).toBe(b0);
    expect(await ledger(A, "janken_bet_refund")).toHaveLength(1);
    expect(
      await mysql("janken_pair_stats").where({ player_a: A, player_b: B }).first()
    ).toMatchObject({
      matches: 2,
      draws: 1,
    });
  });

  test("arena 回歸：無賭注、source=arena、nonBetK=0 → 不建 rating 列、不碰 inventory", async () => {
    const before = await counts("x");
    const result = await JankenService.resolveMatch({
      matchId: "arena-1",
      groupId: "G2",
      p1UserId: C,
      p2UserId: A,
      p1Choice: "rock",
      p2Choice: "paper",
      betAmount: 0,
      source: "arena",
    });
    expect(result).toMatchObject({ p1Result: "lose", p2Result: "win", betAmount: 0, betFee: 0 });
    expect(await JankenRecords.find("arena-1")).toMatchObject({ source: "arena", bet_amount: 0 });
    expect(await mysql("janken_result").where({ record_id: "arena-1" })).toHaveLength(2);
    // C 沒有 rating 列（非下注 + nonBetK=0 與既有行為一致）
    expect(await mysql("janken_rating").where({ user_id: C }).first()).toBeUndefined();
    expect((await counts("x")).ratings).toBe(before.ratings);
    expect(await mysql("inventory").where({ userId: C })).toHaveLength(0);
    expect(redis.zRem).not.toHaveBeenCalled();
  });

  test("整場 rollback：結算中途 throw → records/result/rating/inventory/pair_stats 全部不落地", async () => {
    await preEscrow("d-rb", A, 1000);
    await preEscrow("d-rb", B, 1000);
    const snapshot = {
      a: await balance(A),
      b: await balance(B),
      ratingA: await mysql("janken_rating").where({ user_id: A }).first(),
      pair: await mysql("janken_pair_stats").where({ player_a: A, player_b: B }).first(),
    };
    // 在 janken_result 寫入這一步注入失敗（records 已寫、payout 已寫，全部要回滾）
    const spy = jest.spyOn(JankenResult, "insert").mockRejectedValueOnce(new Error("boom"));

    await expect(
      JankenService.resolveMatch({
        matchId: "d-rb",
        groupId: "G1",
        p1UserId: A,
        p2UserId: B,
        p1Choice: "rock",
        p2Choice: "scissors",
        betAmount: 1000,
      })
    ).rejects.toThrow("boom");
    spy.mockRestore();

    expect(await JankenRecords.find("d-rb")).toBeUndefined();
    expect(await mysql("janken_result").where({ record_id: "d-rb" })).toHaveLength(0);
    expect(await balance(A)).toBe(snapshot.a);
    expect(await balance(B)).toBe(snapshot.b);
    expect(await mysql("janken_rating").where({ user_id: A }).first()).toEqual(snapshot.ratingA);
    expect(await mysql("janken_pair_stats").where({ player_a: A, player_b: B }).first()).toEqual(
      snapshot.pair
    );
    // rollback 時不做任何 Redis 清理（escrow member 留給 cron／重試）
    expect(redis.zRem).not.toHaveBeenCalled();
  });

  test("escrowBet：交易內鎖讀餘額，兩條真實連線同時對同一人 escrow 只有一筆成功", async () => {
    await grant(C, 700);
    redis.zAdd.mockResolvedValue(1);
    const results = await Promise.all([
      JankenService.escrowBet(C, 500, "e-1"),
      JankenService.escrowBet(C, 500, "e-2"),
    ]);
    expect(results.filter(r => r.success)).toHaveLength(1);
    expect(results.find(r => !r.success)).toMatchObject({ success: false, balance: 200 });
    expect(await balance(C)).toBe(200);
    expect(await ledger(C, "janken_bet_escrow")).toHaveLength(1);
    expect(redis.zAdd).toHaveBeenCalledTimes(1);
  });

  test("escrowBet：餘額不足不扣款、不追蹤", async () => {
    const before = await balance(C);
    const result = await JankenService.escrowBet(C, before + 1, "e-3");
    expect(result).toEqual({ success: false, balance: before });
    expect(await balance(C)).toBe(before);
    expect(redis.zAdd).not.toHaveBeenCalled();
  });

  test("refundStaleEscrows：janken_records 已有該 match（已結算）→ 只清 member、不退款", async () => {
    const before = await balance(A);
    redis.zRangeByScore.mockResolvedValueOnce([`d-win|${A}|1000`, `never-settled|${A}|300`]);
    redis.zRem.mockResolvedValue(1);
    const summary = await JankenService.refundStaleEscrows();
    expect(summary).toEqual({ scanned: 2, refunded: 1, failed: 0 });
    expect(await balance(A)).toBe(before + 300);
    expect(await ledger(A, "janken_bet_timeout_refund")).toHaveLength(1);
    expect(redis.zRem).toHaveBeenCalledWith(expect.any(String), `d-win|${A}|1000`);
  });
});
