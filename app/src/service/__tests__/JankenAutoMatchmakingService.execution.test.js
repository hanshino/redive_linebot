// U3 自動配對 manifest 與每場執行交易的真實 DB 證據（AE2、AE3、AE9、AE13、rank cap 0、餘額不足 0 debit、
// KTD12 off→on 授權失效、兩連線 deadlock 有界重試不重抽、部分中斷後 failed／重啟不重打）。
// 用 worldBossFixture 在本機 Docker MySQL 建拋棄式 DB（Princess_wbtest_*），結束只 DROP 自己。
// 不 monkeypatch transaction：所有交易、鎖、rollback 都是真的 InnoDB 行為；Redis 是全域 setup.js 的 mock。
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
if (!["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
  throw new Error(`refuse: DB_HOST is not local (${process.env.DB_HOST})`);
}
const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../__tests__/helpers/worldBossFixture");

const testDatabase = createWorldBossTestDatabase("ajm_exec");
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);

// 段位上限覆寫（只為了讓 AE2 的 1000／300 與「段位上限 0」有可測的數字），其餘 config 用真的 default.json。
// tiers：beginner <1100 / challenger <1250 / fighter <1400 / master <1550 / legend
jest.mock("config", () => {
  const actual = jest.requireActual("config");
  const RANK_CAP = { beginner: 1000, challenger: 300, fighter: 0, master: 500000, legend: 1000000 };
  return {
    get: key => (key === "minigame.janken.bet.maxAmountByRank" ? RANK_CAP : actual.get(key)),
    has: key => actual.has(key),
  };
});

const Service = require("../JankenAutoMatchmakingService");
const JankenService = require("../JankenService");
const Participant = require("../../model/application/JankenAutoMatchParticipant");
const Outbox = require("../../model/application/JankenAutoMatchOutbox");
const JankenRecords = require("../../model/application/JankenRecords");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
const NOW = new Date("2026-09-13T21:00:00+08:00");
const FAR = new Date("2030-01-01T00:00:00+08:00");
const PAST = new Date("2020-01-01T00:00:00+08:00");
const rngOf = seq => {
  let i = 0;
  return () => seq[i++ % seq.length];
};
const idsOf = prefix => {
  let n = 0;
  return () => `${prefix}-${++n}`;
};

async function seedUser(userId, { elo = 1000, stones = 0, sub = "active", pref = {} } = {}) {
  await mysql("user").insert({ platform: "line", platform_id: userId });
  if (stones)
    await mysql("inventory").insert({ userId, itemId: 999, itemAmount: stones, note: "seed" });
  await mysql("janken_rating").insert({ user_id: userId, elo, rank_tier: "beginner" });
  if (sub !== "none") {
    await mysql("subscribe_user").insert({
      user_id: userId,
      subscribe_card_key: "month_plus",
      start_at: PAST,
      end_at: sub === "active" ? FAR : new Date("2026-09-13T20:00:00+08:00"),
    });
  }
  await mysql("user_auto_preference").insert({
    user_id: userId,
    auto_match_enabled: 1,
    auto_match_generation: 1,
    auto_match_bet_enabled: 1,
    auto_match_bet_generation: 1,
    auto_match_bet_cap: 1000,
    ...pref,
  });
}
async function balance(userId) {
  const row = await mysql("inventory")
    .sum({ amount: "itemAmount" })
    .where({ userId, itemId: 999 })
    .first();
  return Number(row.amount || 0);
}
const ledger = (userId, note) => mysql("inventory").where({ userId, itemId: 999, note });
const statusesOf = async matchId => (await Participant.findByMatchId(matchId)).map(r => r.status);
const outboxOf = matchId =>
  mysql("janken_auto_match_outbox").where({ match_id: matchId }).orderBy("event_name");

/**
 * 建立一對 manifest（單一場）並回傳 match。每個測試用自己的 run_date 避免 (run_date,user_id) PK 互撞。
 * 出拳：manifest 的預抽由 rng 決定，但 rng 被 pairing 消耗的次數會依「昨日是否 bye」而變，
 * 這裡直接把測試想要的出拳寫進 manifest 當 fixture（執行端只會讀 manifest，不會重抽）。
 */
async function manifestPair(
  runDate,
  a,
  b,
  { choices = ["rock", "scissors"], prefix = runDate } = {}
) {
  const res = await Service.createDailyManifest({
    runDate,
    now: NOW,
    rng: rngOf([0]),
    newMatchId: idsOf(prefix),
  });
  expect(res.claimed).toBe(true);
  const match = res.matches.find(
    m => [m.p1UserId, m.p2UserId].includes(a) && [m.p1UserId, m.p2UserId].includes(b)
  );
  expect(match).toBeDefined();
  await mysql("janken_auto_match_participant")
    .where({ match_id: match.matchId, role: "p1" })
    .update({ choice: choices[0] });
  await mysql("janken_auto_match_participant")
    .where({ match_id: match.matchId, role: "p2" })
    .update({ choice: choices[1] });
  return match;
}

// ---- knex in-flight 追蹤（兩連線屏障用） ----
const inflight = new Map();
mysql.on("query", q => q.__knexQueryUid && inflight.set(q.__knexQueryUid, q.sql));
mysql.on("query-response", (_r, q) => inflight.delete(q.__knexQueryUid));
mysql.on("query-error", (_e, q) => inflight.delete(q.__knexQueryUid));
const countInflight = re => [...inflight.values()].filter(sql => re.test(sql)).length;
async function waitUntil(pred, { timeout = 15000, interval = 20 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

describe("JankenAutoMatchmakingService manifest + execution (isolated DB)", () => {
  // 固定名單：A beginner(cap1000) / B challenger(cap300) / F fighter(cap0)
  const A = U("a");
  const B = U("b");
  const C = U("c");
  const D = U("d"); // 訂閱已過期
  const E = U("e"); // 未開啟配對
  const F = U("f"); // fighter，段位上限 0
  const G = U("g"); // 餘額只有 400
  const H = U("h");

  beforeAll(async () => {
    await testDatabase.setup();
    await seedUser(A, { elo: 1000, stones: 10000, pref: { auto_match_bet_cap: 500 } });
    await seedUser(B, { elo: 1100, stones: 10000, pref: { auto_match_bet_cap: 2000 } });
    await seedUser(C, { elo: 1000, stones: 10000 });
    await seedUser(D, { elo: 1000, stones: 10000, sub: "expired" });
    await seedUser(E, { elo: 1000, stones: 10000, pref: { auto_match_enabled: 0 } });
    await seedUser(F, { elo: 1300, stones: 10000, pref: { auto_match_bet_cap: 5000 } });
    await seedUser(G, { elo: 1000, stones: 400, pref: { auto_match_bet_cap: 5000 } });
    await seedUser(H, { elo: 1000, stones: 10000, pref: { auto_match_bet_cap: 5000 } });
  }, SETUP_TIMEOUT_MS);
  afterAll(() => testDatabase.teardown());

  test("manifest：只收合格＋已開啟者、奇數落單 bye、快照與預抽出拳落地；同日第二次 claim=false；兩連線只一個搶到", async () => {
    const res = await Service.createDailyManifest({
      runDate: "2026-09-01",
      now: NOW,
      rng: rngOf([0]),
      newMatchId: idsOf("m1"),
    });
    expect(res.claimed).toBe(true);
    const rows = await mysql("janken_auto_match_participant").where({ run_date: "2026-09-01" });
    const ids = rows.map(r => r.user_id).sort();
    // D（過期）、E（未開啟）不在名單
    expect(ids).toEqual([A, B, C, F, G, H]);
    expect(rows.filter(r => r.status === "bye")).toHaveLength(0);
    expect(res.matches).toHaveLength(3);
    for (const r of rows) {
      expect(["rock", "paper", "scissors"]).toContain(r.choice);
      expect(r.match_generation).toBe(1);
      expect(r.bet_generation).toBe(1);
    }
    expect(rows.find(r => r.user_id === A)).toMatchObject({ bet_enabled: 1, bet_cap: 500 });

    // 同一天再 claim → false、不重配
    const again = await Service.createDailyManifest({
      runDate: "2026-09-01",
      now: NOW,
      rng: rngOf([0]),
    });
    expect(again).toMatchObject({ claimed: false, matches: [] });
    expect(
      await mysql("janken_auto_match_participant").where({ run_date: "2026-09-01" })
    ).toHaveLength(6);

    // 兩條真實連線同時 claim 另一天，只有一個成功
    const race = await Promise.all([
      Service.createDailyManifest({
        runDate: "2026-09-02",
        now: NOW,
        rng: rngOf([0]),
        newMatchId: idsOf("r1"),
      }),
      Service.createDailyManifest({
        runDate: "2026-09-02",
        now: NOW,
        rng: rngOf([0]),
        newMatchId: idsOf("r2"),
      }),
    ]);
    expect(race.filter(r => r.claimed)).toHaveLength(1);
    expect(await mysql("janken_auto_match_run").where({ run_date: "2026-09-02" })).toHaveLength(1);
  });

  test("manifest：奇數人數落單者為 bye，昨日 bye 今日優先被服務", async () => {
    // 只讓 A、B、C 合格：暫時關掉其他人
    await mysql("user_auto_preference")
      .whereNotIn("user_id", [A, B, C])
      .update({ auto_match_enabled: 0 });
    try {
      const day1 = await Service.createDailyManifest({
        runDate: "2026-09-03",
        now: NOW,
        rng: rngOf([0.99, 0.99, 0.99, 0]), // 讓 C 排到最後 → C bye
        newMatchId: idsOf("o1"),
      });
      expect(day1.byeUserIds).toHaveLength(1);
      const bye = day1.byeUserIds[0];
      expect(await Participant.findByUserAndDate(bye, "2026-09-03")).toMatchObject({
        status: "bye",
        match_id: null,
        choice: null,
      });

      const day2 = await Service.createDailyManifest({
        runDate: "2026-09-04",
        now: NOW,
        rng: rngOf([0.99, 0.99, 0.99, 0]),
        newMatchId: idsOf("o2"),
      });
      // 昨日 bye 者今天一定在 pairs 內
      expect(day2.matches.some(m => [m.p1UserId, m.p2UserId].includes(bye))).toBe(true);
      expect(day2.byeUserIds).not.toContain(bye);
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [F, G, H])
        .update({ auto_match_enabled: 1 });
    }
  });

  test("AE2：candidate = min(500, 2000, 段位 1000, 段位 300) = 300；inline 雙扣、payout、source=auto、outbox、completed 同 commit", async () => {
    await mysql("user_auto_preference")
      .whereNotIn("user_id", [A, B])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-05", A, B, { choices: ["rock", "scissors"] });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [C, F, G, H])
        .update({ auto_match_enabled: 1 });
    }
    const [a0, b0] = [await balance(A), await balance(B)];

    const out = await Service.executeMatch({ matchId: match.matchId, now: NOW });
    expect(out.status).toBe("completed");
    expect(out.attempts).toBe(1);
    expect(out.result).toMatchObject({ betAmount: 300, betFee: 60 });

    const p1 = match.p1UserId;
    const p2 = match.p2UserId;
    const [p1Result] = JankenService.determineWinner("rock", "scissors");
    const winner = p1Result === "win" ? p1 : p2;
    const loser = winner === p1 ? p2 : p1;
    expect(await ledger(p1, "janken_auto_bet")).toHaveLength(1);
    expect(await ledger(p2, "janken_auto_bet")).toHaveLength(1);
    expect(await balance(winner)).toBe((winner === A ? a0 : b0) - 300 + 540);
    expect(await balance(loser)).toBe((loser === A ? a0 : b0) - 300);

    expect(await JankenRecords.find(match.matchId)).toMatchObject({
      source: "auto",
      bet_amount: 300,
      bet_fee: 60,
      group_id: null,
      p1_choice: "rock",
      p2_choice: "scissors",
    });
    expect(await mysql("janken_result").where({ record_id: match.matchId })).toHaveLength(2);
    expect(await statusesOf(match.matchId)).toEqual(["completed", "completed"]);
    const events = await outboxOf(match.matchId);
    expect(events.map(e => [e.event_name, e.role, e.user_id])).toEqual([
      ["janken_challenge", "p2", p2],
      ["janken_win", p1Result === "win" ? "p1" : "p2", winner],
    ]);
    expect(events[1].payload).toMatchObject({ result: "win", feature: "janken" });
    expect(events.every(e => e.processed_at === null && e.attempts === 0)).toBe(true);
  });

  test("AE3：candidate 1000 但一方餘額 400 → 整場 0 debit、對戰仍完成、雙方餘額不變、不降額", async () => {
    await mysql("user_auto_preference")
      .whereNotIn("user_id", [G, H])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-06", G, H, { choices: ["paper", "rock"] });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [A, B, C, F])
        .update({ auto_match_enabled: 1 });
    }
    const [g0, h0] = [await balance(G), await balance(H)];
    const out = await Service.executeMatch({ matchId: match.matchId, now: NOW });
    expect(out.status).toBe("completed");
    expect(out.result.betAmount).toBe(0);
    expect(await balance(G)).toBe(g0);
    expect(await balance(H)).toBe(h0);
    expect(await ledger(G, "janken_auto_bet")).toHaveLength(0);
    expect(await JankenRecords.find(match.matchId)).toMatchObject({
      bet_amount: 0,
      source: "auto",
    });
    expect(await statusesOf(match.matchId)).toEqual(["completed", "completed"]);
    // 非下注勝負仍寫成就 outbox（沿用手動對戰：成就事件不看賭金）
    expect(await outboxOf(match.matchId)).toHaveLength(2);
  });

  test("段位上限 0 是合法值 → 不下注（不得 || fallback）", async () => {
    await mysql("user_auto_preference")
      .whereNotIn("user_id", [F, H])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-07", F, H);
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [A, B, C, G])
        .update({ auto_match_enabled: 1 });
    }
    const [f0, h0] = [await balance(F), await balance(H)];
    const out = await Service.executeMatch({ matchId: match.matchId, now: NOW });
    expect(out.status).toBe("completed");
    expect(out.result.betAmount).toBe(0);
    expect(await balance(F)).toBe(f0);
    expect(await balance(H)).toBe(h0);
  });

  test("KTD12：manifest 後 off→on（generation 變）→ 下注同意失效該場不下注；參與同意失效該場 failed 且無任何落地", async () => {
    await mysql("user_auto_preference")
      .whereNotIn("user_id", [A, C])
      .update({ auto_match_enabled: 0 });
    let m1;
    let m2;
    try {
      m1 = await manifestPair("2026-09-08", A, C, { prefix: "g1" });
      m2 = await manifestPair("2026-09-09", A, C, { prefix: "g2" });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [B, F, G, H])
        .update({ auto_match_enabled: 1 });
    }

    // (1) C 關掉再打開下注同意 → bet generation 2 ≠ 快照 1
    await mysql("user_auto_preference")
      .where({ user_id: C })
      .update({ auto_match_bet_generation: 2 });
    const [a0, c0] = [await balance(A), await balance(C)];
    const out1 = await Service.executeMatch({ matchId: m1.matchId, now: NOW });
    expect(out1.status).toBe("completed");
    expect(out1.result.betAmount).toBe(0);
    expect(await balance(A)).toBe(a0);
    expect(await balance(C)).toBe(c0);

    // (2) C 關掉再打開參與 → match generation 2 ≠ 快照 1 → failed，不重配、不落任何帳
    await mysql("user_auto_preference").where({ user_id: C }).update({ auto_match_generation: 2 });
    const out2 = await Service.executeMatch({ matchId: m2.matchId, now: NOW });
    expect(out2.status).toBe("failed");
    expect(out2.error.code).toBe("AUTHORIZATION_REVOKED");
    expect(await statusesOf(m2.matchId)).toEqual(["failed", "failed"]);
    expect(await JankenRecords.find(m2.matchId)).toBeUndefined();
    expect(await mysql("janken_result").where({ record_id: m2.matchId })).toHaveLength(0);
    expect(await outboxOf(m2.matchId)).toHaveLength(0);
    expect(await balance(C)).toBe(c0);
    // 還原 C
    await mysql("user_auto_preference").where({ user_id: C }).update({
      auto_match_generation: 1,
      auto_match_bet_generation: 1,
    });
  });

  test("R4：manifest 後訂閱到期 → 執行時資格重讀不成立 → failed", async () => {
    await mysql("user_auto_preference")
      .whereNotIn("user_id", [B, C])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-10", B, C);
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [A, F, G, H])
        .update({ auto_match_enabled: 1 });
    }
    await mysql("subscribe_user")
      .where({ user_id: B })
      .update({ end_at: new Date("2026-09-13T20:59:00+08:00") });
    try {
      const out = await Service.executeMatch({ matchId: match.matchId, now: NOW });
      expect(out.status).toBe("failed");
      expect(await JankenRecords.find(match.matchId)).toBeUndefined();
    } finally {
      await mysql("subscribe_user").where({ user_id: B }).update({ end_at: FAR });
    }
  });

  test("AE9：同一場重新執行 → skipped，不二扣；同日整批重跑 claim=false 不重打", async () => {
    await mysql("user_auto_preference")
      .whereNotIn("user_id", [A, B])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-11", A, B, { prefix: "ae9" });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [C, F, G, H])
        .update({ auto_match_enabled: 1 });
    }
    const first = await Service.executeMatch({ matchId: match.matchId, now: NOW });
    expect(first.status).toBe("completed");
    expect(first.result.betAmount).toBeGreaterThan(0);
    const debitsA = (await ledger(A, "janken_auto_bet")).length;

    const second = await Service.executeMatch({ matchId: match.matchId, now: NOW });
    expect(second).toMatchObject({ status: "completed", skipped: true });
    expect((await ledger(A, "janken_auto_bet")).length).toBe(debitsA);
    expect(await mysql("janken_records").where({ id: match.matchId })).toHaveLength(1);

    const rerun = await Service.runDailyAutoMatch({
      runDate: "2026-09-11",
      now: NOW,
      rng: rngOf([0]),
    });
    expect(rerun).toMatchObject({ claimed: false, results: [] });
  });

  test("AE13：結算末段中斷 → 真 rollback 全部不落地 → status-only CAS failed；重啟不補打（skipped=failed）", async () => {
    await mysql("user_auto_preference")
      .whereNotIn("user_id", [A, B])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-12", A, B, { prefix: "ae13" });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [C, F, G, H])
        .update({ auto_match_enabled: 1 });
    }
    const [a0, b0] = [await balance(A), await balance(B)];
    const ratingA = await mysql("janken_rating").where({ user_id: A }).first();
    const spy = jest
      .spyOn(Outbox, "insertEvents")
      .mockRejectedValueOnce(new Error("crash before commit"));

    const out = await Service.executeMatch({ matchId: match.matchId, now: NOW });
    spy.mockRestore();
    expect(out.status).toBe("failed");
    expect(out.attempts).toBe(1); // 非 deadlock 錯誤不重試
    expect(await statusesOf(match.matchId)).toEqual(["failed", "failed"]);
    expect(await JankenRecords.find(match.matchId)).toBeUndefined();
    expect(await mysql("janken_result").where({ record_id: match.matchId })).toHaveLength(0);
    expect(await outboxOf(match.matchId)).toHaveLength(0);
    expect(await balance(A)).toBe(a0);
    expect(await balance(B)).toBe(b0);
    expect(await mysql("janken_rating").where({ user_id: A }).first()).toEqual(ratingA);

    const again = await Service.executeMatch({ matchId: match.matchId, now: NOW });
    expect(again).toMatchObject({ status: "failed", skipped: true });
    expect(await JankenRecords.find(match.matchId)).toBeUndefined();
  });

  test("有界重試：deadlock 一次後重跑同一 manifest（同 matchId／同出拳）成功；連續 deadlock 到上限 → failed 無扣款", async () => {
    await mysql("user_auto_preference")
      .whereNotIn("user_id", [A, B])
      .update({ auto_match_enabled: 0 });
    let m1;
    let m2;
    try {
      m1 = await manifestPair("2026-09-14", A, B, { prefix: "dl1", choices: ["paper", "rock"] });
      m2 = await manifestPair("2026-09-15", A, B, { prefix: "dl2" });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [C, F, G, H])
        .update({ auto_match_enabled: 1 });
    }
    const deadlock = () => Object.assign(new Error("Deadlock found"), { code: "ER_LOCK_DEADLOCK" });
    const real = JankenService.settleMatchInTransaction;
    const seen = [];
    const spy = jest
      .spyOn(JankenService, "settleMatchInTransaction")
      .mockImplementation((trx, params) => {
        seen.push({
          matchId: params.matchId,
          p1Choice: params.p1Choice,
          p2Choice: params.p2Choice,
        });
        if (seen.length === 1) return Promise.reject(deadlock());
        return real(trx, params);
      });
    const out = await Service.executeMatch({ matchId: m1.matchId, now: NOW });
    spy.mockRestore();
    expect(out.status).toBe("completed");
    expect(out.attempts).toBe(2);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(seen[1]); // 不重抽
    expect(await JankenRecords.find(m1.matchId)).toMatchObject({
      p1_choice: "paper",
      p2_choice: "rock",
    });

    const [a0, b0] = [await balance(A), await balance(B)];
    const always = jest
      .spyOn(JankenService, "settleMatchInTransaction")
      .mockRejectedValue(deadlock());
    const out2 = await Service.executeMatch({ matchId: m2.matchId, now: NOW });
    always.mockRestore();
    expect(out2).toMatchObject({ status: "failed", attempts: Service.EXECUTE_MAX_ATTEMPTS });
    expect(await statusesOf(m2.matchId)).toEqual(["failed", "failed"]);
    expect(await balance(A)).toBe(a0);
    expect(await balance(B)).toBe(b0);
  });

  test("兩條真實連線：holder 持 rating 鎖再反向要 user 鎖製造 InnoDB deadlock；執行端最終恰完成一次、單次扣款、出拳不變", async () => {
    await mysql("user_auto_preference")
      .whereNotIn("user_id", [A, B])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-16", A, B, {
        prefix: "real-dl",
        choices: ["scissors", "paper"],
      });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [C, F, G, H])
        .update({ auto_match_enabled: 1 });
    }
    const [a0, b0] = [await balance(A), await balance(B)];
    const debitsBefore = (await ledger(A, "janken_auto_bet")).length;

    const holder = await mysql.transaction();
    let pending;
    let holderOutcome = "released";
    try {
      // holder 先把自己「加重」：InnoDB 選 deadlock victim 時偏向回滾持鎖／修改較少的一方，
      // 這裡多寫一批與斷言無關的暫存列，讓執行端成為 victim、真的走到有界重試。
      await holder("inventory").insert(
        Array.from({ length: 200 }, (_, i) => ({ userId: U("z"), itemId: 1, itemAmount: i }))
      );
      await holder("janken_rating").where({ user_id: A }).forUpdate().first();

      pending = Service.executeMatch({ matchId: match.matchId, now: NOW });
      const blocked = await waitUntil(() => countInflight(/janken_rating.*for update/i) >= 1);
      expect(blocked).toBe(true);

      // holder 反向要執行端已持有的 user A 鎖 → deadlock；InnoDB 會回滾其中一方。
      try {
        await holder("user").where({ platform_id: A }).forUpdate().first("id");
      } catch (error) {
        holderOutcome = error.code;
      }
    } finally {
      if (!holder.isCompleted()) await holder.rollback().catch(() => {});
    }
    const out = await pending;

    // 不論 victim 是誰，最終不變量：恰完成一次、一次扣款、出拳與 manifest 相同、attempts 有界
    expect(out.status).toBe("completed");
    expect(out.attempts).toBeGreaterThanOrEqual(1);
    expect(out.attempts).toBeLessThanOrEqual(Service.EXECUTE_MAX_ATTEMPTS);
    if (holderOutcome === "released") expect(out.attempts).toBe(2); // 執行端是 victim → 真的走了重試
    expect((await ledger(A, "janken_auto_bet")).length).toBe(debitsBefore + 1);
    const record = await JankenRecords.find(match.matchId);
    expect(record).toMatchObject({ p1_choice: "scissors", p2_choice: "paper" });
    expect(record.bet_amount).toBeGreaterThan(0); // 段位上限隨前面測試的 Elo 漂移，不釘死金額
    expect((await balance(A)) + (await balance(B))).toBe(a0 + b0 - record.bet_fee); // 只少手續費
    expect(await statusesOf(match.matchId)).toEqual(["completed", "completed"]);
  });

  // --- Orchestrator 回報的修正項 1：授權時鐘與事件歸屬時鐘分離（KTD3／R4） ---
  // manifest 建立當下（T0）訂閱仍有效，但實際執行被延後到 T0+10min，此時訂閱已在 T0+3min 到期。
  // `now`（occurred_at／run_date 事件歸屬）與 `clock`（R4／KTD12 資格重讀）必須是兩個獨立時間源：
  // 若整批沿用同一個凍結的 `now` 做授權判斷，晚執行的場次會錯誤地仍判定訂閱有效。
  test("授權時鐘與事件時鐘分離：manifest T0 訂閱有效，執行延後到 T0+10min（訂閱已於 T0+3min 到期）→ failed 且不扣款不落 record", async () => {
    const I = U("i");
    const T0 = new Date("2026-09-20T21:00:00+08:00");
    const cardExpiry = new Date(T0.getTime() + 3 * 60 * 1000);
    const executionTime = new Date(T0.getTime() + 10 * 60 * 1000);
    await mysql("user").insert({ platform: "line", platform_id: I });
    await mysql("inventory").insert({ userId: I, itemId: 999, itemAmount: 10000, note: "seed" });
    await mysql("janken_rating").insert({ user_id: I, elo: 1000, rank_tier: "beginner" });
    await mysql("subscribe_user").insert({
      user_id: I,
      subscribe_card_key: "month_plus",
      start_at: PAST,
      end_at: cardExpiry, // T0 時仍有效，T0+10min 執行時已過期
    });
    await mysql("user_auto_preference").insert({
      user_id: I,
      auto_match_enabled: 1,
      auto_match_generation: 1,
      auto_match_bet_enabled: 1,
      auto_match_bet_generation: 1,
      auto_match_bet_cap: 1000,
    });

    await mysql("user_auto_preference")
      .whereNotIn("user_id", [A, I])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-20", A, I, { prefix: "clock-sep" });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [B, C, F, G, H])
        .update({ auto_match_enabled: 1 });
    }

    const [a0, i0] = [await balance(A), await balance(I)];
    // now＝事件歸屬（維持 T0，不影響本測試斷言）；clock＝授權檢查，回傳「實際執行當下」T0+10min。
    const out = await Service.executeMatch({
      matchId: match.matchId,
      now: T0,
      clock: () => executionTime,
    });
    expect(out.status).toBe("failed");
    expect(out.error.code).toBe("AUTHORIZATION_REVOKED");
    expect(await statusesOf(match.matchId)).toEqual(["failed", "failed"]);
    expect(await JankenRecords.find(match.matchId)).toBeUndefined();
    expect(await mysql("janken_result").where({ record_id: match.matchId })).toHaveLength(0);
    expect(await outboxOf(match.matchId)).toHaveLength(0);
    expect(await balance(A)).toBe(a0);
    expect(await balance(I)).toBe(i0);
  });

  test("授權時鐘與事件時鐘分離：clock 回傳到期前的時間則仍能成立（同一 manifest，僅授權時間點不同）", async () => {
    const J = U("j");
    const T0 = new Date("2026-09-21T21:00:00+08:00");
    const cardExpiry = new Date(T0.getTime() + 3 * 60 * 1000);
    const beforeExpiry = new Date(T0.getTime() + 1 * 60 * 1000);
    await mysql("user").insert({ platform: "line", platform_id: J });
    await mysql("inventory").insert({ userId: J, itemId: 999, itemAmount: 10000, note: "seed" });
    await mysql("janken_rating").insert({ user_id: J, elo: 1000, rank_tier: "beginner" });
    await mysql("subscribe_user").insert({
      user_id: J,
      subscribe_card_key: "month_plus",
      start_at: PAST,
      end_at: cardExpiry,
    });
    await mysql("user_auto_preference").insert({
      user_id: J,
      auto_match_enabled: 1,
      auto_match_generation: 1,
      auto_match_bet_enabled: 1,
      auto_match_bet_generation: 1,
      auto_match_bet_cap: 1000,
    });

    await mysql("user_auto_preference")
      .whereNotIn("user_id", [A, J])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-21", A, J, { prefix: "clock-sep-ok" });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [B, C, F, G, H])
        .update({ auto_match_enabled: 1 });
    }

    const out = await Service.executeMatch({
      matchId: match.matchId,
      now: T0,
      clock: () => beforeExpiry,
    });
    expect(out.status).toBe("completed");
    expect(await JankenRecords.find(match.matchId)).toBeDefined();
  });

  test("retry 前才過期也應重新判資格：deadlock 觸發重試，第二次 attempt 的 clock 已在到期後 → 該次 attempt 判 failed（不是沿用第一次的舊授權結果）", async () => {
    const K = U("k");
    const T0 = new Date("2026-09-22T21:00:00+08:00");
    const cardExpiry = new Date(T0.getTime() + 3 * 60 * 1000);
    const beforeExpiry = new Date(T0.getTime() + 1 * 60 * 1000); // attempt 1：仍有效
    const afterExpiry = new Date(T0.getTime() + 10 * 60 * 1000); // attempt 2：已過期
    await mysql("user").insert({ platform: "line", platform_id: K });
    await mysql("inventory").insert({ userId: K, itemId: 999, itemAmount: 10000, note: "seed" });
    await mysql("janken_rating").insert({ user_id: K, elo: 1000, rank_tier: "beginner" });
    await mysql("subscribe_user").insert({
      user_id: K,
      subscribe_card_key: "month_plus",
      start_at: PAST,
      end_at: cardExpiry,
    });
    await mysql("user_auto_preference").insert({
      user_id: K,
      auto_match_enabled: 1,
      auto_match_generation: 1,
      auto_match_bet_enabled: 1,
      auto_match_bet_generation: 1,
      auto_match_bet_cap: 1000,
    });

    await mysql("user_auto_preference")
      .whereNotIn("user_id", [A, K])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-22", A, K, { prefix: "clock-retry" });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [B, C, F, G, H])
        .update({ auto_match_enabled: 1 });
    }

    const deadlock = () => Object.assign(new Error("Deadlock found"), { code: "ER_LOCK_DEADLOCK" });
    const real = JankenService.settleMatchInTransaction;
    let call = 0;
    const spy = jest
      .spyOn(JankenService, "settleMatchInTransaction")
      .mockImplementation((trx, params) => {
        call += 1;
        if (call === 1) return Promise.reject(deadlock()); // 強制走到第二次 attempt
        return real(trx, params);
      });
    let clockCalls = 0;
    const out = await Service.executeMatch({
      matchId: match.matchId,
      now: T0,
      clock: () => {
        clockCalls += 1;
        return clockCalls === 1 ? beforeExpiry : afterExpiry;
      },
    });
    spy.mockRestore();

    expect(clockCalls).toBe(2); // 每次 attempt 各自重取一次
    expect(out.status).toBe("failed");
    expect(out.attempts).toBe(2);
    expect(out.error.code).toBe("AUTHORIZATION_REVOKED");
    expect(await JankenRecords.find(match.matchId)).toBeUndefined();
    expect(await statusesOf(match.matchId)).toEqual(["failed", "failed"]);
  });

  // --- Orchestrator 回報的修正項 3：manifest wantsBet 分類只看 enabled，cap 只影響 U3 execution 結算 ---

  test("manifest：cap=0 但 enabled 的使用者，配對分類（R8 wantsBet）比照 enabled 且 cap>0，不視為跨意願", async () => {
    // 修正項 3：manifest wantsBet 分類過去＝bet_enabled && cap>0，會把「cap=0 但仍想下注」的
    // 使用者誤判成跨意願（等同 bet disabled），違反 R8「同下注意願優先」；分類應只看 enabled，
    // cap 只影響 U3 execution 的實際結算金額（含 cap=0 導致免費對戰，R15），不該回頭改變配對分類。
    const L = U("l"); // enabled=1, cap=0
    const M = U("m"); // enabled=1, cap=1000（同意願，應與 L 優先湊對）
    const N = U("n"); // enabled=0（跨意願，只有在同意願池找不到對象才會配到這裡）
    for (const [id, cap, enabled] of [
      [L, 0, 1],
      [M, 1000, 1],
      [N, 0, 0],
    ]) {
      await mysql("user").insert({ platform: "line", platform_id: id });
      await mysql("janken_rating").insert({ user_id: id, elo: 1000, rank_tier: "beginner" });
      await mysql("subscribe_user").insert({
        user_id: id,
        subscribe_card_key: "month_plus",
        start_at: PAST,
        end_at: FAR,
      });
      await mysql("user_auto_preference").insert({
        user_id: id,
        auto_match_enabled: 1,
        auto_match_generation: 1,
        auto_match_bet_enabled: enabled,
        auto_match_bet_generation: 1,
        auto_match_bet_cap: cap,
      });
    }

    await mysql("user_auto_preference")
      .whereNotIn("user_id", [L, M, N])
      .update({ auto_match_enabled: 0 });
    let res;
    try {
      // rng 序列 [0, 0, 0.6] 是刻意選的：能區分「錯誤分類（L 因 cap=0 被當跨意願、與 N 湊對、M 落單）」
      // 與「正確分類（L、M 同意願優先湊對、N 落單）」——不是任意值都能在配對層面暴露這個分類錯誤。
      res = await Service.createDailyManifest({
        runDate: "2026-09-23",
        now: NOW,
        rng: rngOf([0, 0, 0.6]),
        newMatchId: idsOf("cap0-pool"),
      });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [A, B, C, F, G, H])
        .update({ auto_match_enabled: 1 });
    }

    expect(res.claimed).toBe(true);
    // L 與 M 同意願（enabled=1），必須優先配成一對；N（enabled=0）落單，而不是 L 因 cap=0 被誤配去跟 N 配對。
    expect(res.matches).toHaveLength(1);
    expect([res.matches[0].p1UserId, res.matches[0].p2UserId].sort()).toEqual([L, M].sort());
    expect(res.byeUserIds).toEqual([N]);
  });

  test("manifest：cap=0 但 enabled 的使用者執行時因低於最低下注額仍不下注（R15 沿用既有免費對戰邏輯）", async () => {
    const P = U("p"); // enabled=1, cap=0
    const Q = U("q"); // enabled=1, cap=1000
    for (const [id, cap] of [
      [P, 0],
      [Q, 1000],
    ]) {
      await mysql("user").insert({ platform: "line", platform_id: id });
      await mysql("inventory").insert({ userId: id, itemId: 999, itemAmount: 10000, note: "seed" });
      await mysql("janken_rating").insert({ user_id: id, elo: 1000, rank_tier: "beginner" });
      await mysql("subscribe_user").insert({
        user_id: id,
        subscribe_card_key: "month_plus",
        start_at: PAST,
        end_at: FAR,
      });
      await mysql("user_auto_preference").insert({
        user_id: id,
        auto_match_enabled: 1,
        auto_match_generation: 1,
        auto_match_bet_enabled: 1,
        auto_match_bet_generation: 1,
        auto_match_bet_cap: cap,
      });
    }

    await mysql("user_auto_preference")
      .whereNotIn("user_id", [P, Q])
      .update({ auto_match_enabled: 0 });
    let match;
    try {
      match = await manifestPair("2026-09-24", P, Q, { prefix: "cap0-free" });
    } finally {
      await mysql("user_auto_preference")
        .whereIn("user_id", [A, B, C, F, G, H])
        .update({ auto_match_enabled: 1 });
    }

    const [p0, q0] = [await balance(P), await balance(Q)];
    const out = await Service.executeMatch({ matchId: match.matchId, now: NOW });
    expect(out.status).toBe("completed");
    // candidate = min(P.cap=0, Q.cap=1000, ...) = 0 → 非正整數 → 不下注（R15 既有 nonBetK/免費場邏輯）
    expect(out.result.betAmount).toBe(0);
    expect(await balance(P)).toBe(p0);
    expect(await balance(Q)).toBe(q0);
    expect(await JankenRecords.find(match.matchId)).toMatchObject({
      bet_amount: 0,
      source: "auto",
    });
  });
});
