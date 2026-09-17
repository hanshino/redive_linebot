// U2：JankenAutoMatchmakingService 純函式配對演算法（R8）＋可注入 RNG（KTD15）。
// 這裡只驗證純函式本身：不連 DB/Redis、不建立 match_id/manifest、不做金流判斷（U3 以後）。
jest.mock("../../model/application/SubscribeUser", () => {
  throw new Error("Pure pairing must not load subscription runtime");
});
const { pairForDailyRun } = require("../JankenAutoMatchmakingService");

// 固定序列 rng：每次成功配對只消耗一個值（pool.length===1 時仍會呼叫 rng()，只是結果恆為 index 0）。
function fakeRng(sequence) {
  let i = 0;
  return () => {
    if (i >= sequence.length) {
      throw new Error(`fakeRng exhausted at call #${i + 1}; sequence length=${sequence.length}`);
    }
    return sequence[i++];
  };
}

const candidate = (userId, { wantsBet = false, wasByeYesterday = false } = {}) => ({
  userId,
  wantsBet,
  wasByeYesterday,
});

function allUserIds(candidates) {
  return candidates.map(c => c.userId).sort();
}

function coveredUserIds(result) {
  const fromPairs = result.pairs.flatMap(p => [p.userAId, p.userBId]);
  return [...fromPairs, ...result.byeUserIds].sort();
}

describe("JankenAutoMatchmakingService.pairForDailyRun", () => {
  test("空輸入：無人配對、無人輪空", () => {
    expect(pairForDailyRun([])).toEqual({ pairs: [], byeUserIds: [] });
  });

  test("單人：必定輪空，不丟例外", () => {
    const result = pairForDailyRun([candidate("U1")], { rng: fakeRng([]) });
    expect(result).toEqual({ pairs: [], byeUserIds: ["U1"] });
  });

  test("AE1：兩位一般使用者、同下注意願 → 配對成功，且該場 betIntentMatched=true", () => {
    const candidates = [
      candidate("U_A", { wantsBet: false }),
      candidate("U_B", { wantsBet: false }),
    ];
    // 呼叫次數：tier2 洗牌（size2）1 次。此案例對象唯一（tierPool/sameIntent 皆只剩對方），
    // 不再額外呼叫 pickRandom；用同一固定值多跑一次證明「唯一可能結果」與 rng 值無關。
    for (const rngValue of [0, 0.9]) {
      const result = pairForDailyRun(candidates, { rng: fakeRng([rngValue]) });
      expect(result).toEqual({
        pairs: [{ userAId: "U_A", userBId: "U_B", betIntentMatched: true }],
        byeUserIds: [],
      });
    }
  });

  test("全同意願：奇數 3 人皆同下注意願 → 恰 1 人輪空，其餘配成一對；固定 rng 唯一決定輪空者", () => {
    const candidates = [
      candidate("U_A", { wantsBet: true }),
      candidate("U_B", { wantsBet: true }),
      candidate("U_C", { wantsBet: true }),
    ];
    // 呼叫次數：tier2 洗牌（size3）2 次＋pickRandom（size2）1 次 = 3。
    // 固定同一值餵給洗牌與 pickRandom：val=0 → A 落單以外的組合（B-A 配對，C bye）。
    const result = pairForDailyRun(candidates, { rng: fakeRng([0, 0, 0]) });
    expect(result.pairs).toEqual([{ userAId: "U_A", userBId: "U_B", betIntentMatched: true }]);
    expect(result.byeUserIds).toEqual(["U_C"]);
  });

  test("AE4：昨日輪空者優先取得配對，且在多名同意願候選人中以 rng 隨機選一位（可重現）", () => {
    const candidates = [
      candidate("U_YESTERDAY_BYE", { wantsBet: true, wasByeYesterday: true }),
      candidate("U_B", { wantsBet: true }),
      candidate("U_C", { wantsBet: true }),
    ];
    // 呼叫次數：tier1 洗牌（size1，不呼叫 rng）＋tier2 洗牌（size2）1 次＋pickRandom（size2）1 次 = 2。
    const resultPickB = pairForDailyRun(candidates, { rng: fakeRng([0, 0]) });
    expect(resultPickB.pairs).toEqual([
      { userAId: "U_YESTERDAY_BYE", userBId: "U_B", betIntentMatched: true },
    ]);
    expect(resultPickB.byeUserIds).toEqual(["U_C"]);

    // 同一輸入、不同固定 rng 值 → 不同但仍唯一決定的輸出（可重現，非真隨機重跑）
    const resultPickC = pairForDailyRun(candidates, { rng: fakeRng([0, 0.999]) });
    expect(resultPickC.pairs).toEqual([
      { userAId: "U_YESTERDAY_BYE", userBId: "U_C", betIntentMatched: true },
    ]);
    expect(resultPickC.byeUserIds).toEqual(["U_B"]);

    // 同一 rng 序列重跑兩次結果完全一致（可重現）
    expect(pairForDailyRun(candidates, { rng: fakeRng([0, 0]) })).toEqual(resultPickB);
  });

  test("AE5：昨日輪空者找不到同下注意願對象 → 跨意願池配對，該場 betIntentMatched=false", () => {
    const candidates = [
      candidate("U_YESTERDAY_BYE", { wantsBet: true, wasByeYesterday: true }),
      candidate("U_B", { wantsBet: false }),
      candidate("U_C", { wantsBet: false }),
    ];
    // A 的 sameIntent 池為空 → fallback 到同層 tierPool（{B, C}）。呼叫次數同 AE4 = 2。
    const result = pairForDailyRun(candidates, { rng: fakeRng([0, 0]) });
    expect(result.pairs).toEqual([
      { userAId: "U_YESTERDAY_BYE", userBId: "U_B", betIntentMatched: false },
    ]);
    expect(result.byeUserIds).toEqual(["U_C"]);
  });

  test("AE6：一般使用者為奇數 → 配對完成後恰有一人輪空", () => {
    const candidates = [
      candidate("U_A", { wantsBet: false }),
      candidate("U_B", { wantsBet: true }),
      candidate("U_C", { wantsBet: false }),
      candidate("U_D", { wantsBet: true }),
      candidate("U_E", { wantsBet: false }),
    ];
    // 呼叫次數：tier2 洗牌（size5）4 次＋兩輪 pickRandom 1 次 = 5。
    const result = pairForDailyRun(candidates, { rng: fakeRng([0, 0, 0, 0, 0]) });
    expect(result.byeUserIds).toHaveLength(1);
    expect(result.pairs).toHaveLength(2);
    expect(coveredUserIds(result)).toEqual(allUserIds(candidates));
  });

  test("跨意願避免留下兩人輪空：3 位同意願＋1 位不同意願（偶數 4 人）→ 0 人輪空，其中一對跨意願", () => {
    const candidates = [
      candidate("U_A", { wantsBet: true }),
      candidate("U_B", { wantsBet: true }),
      candidate("U_C", { wantsBet: true }),
      candidate("U_D", { wantsBet: false }),
    ];
    // 呼叫次數：tier2 洗牌（size4）3 次＋第一輪 pickRandom 1 次 = 4
    // （C 配 D 時 tierPool 只剩 D 一人，pickRandom 不再呼叫 rng）。
    const result = pairForDailyRun(candidates, { rng: fakeRng([0, 0, 0, 0]) });
    expect(result.byeUserIds).toEqual([]);
    expect(result.pairs).toEqual([
      { userAId: "U_A", userBId: "U_B", betIntentMatched: true },
      { userAId: "U_C", userBId: "U_D", betIntentMatched: false },
    ]);
  });

  test("全跨意願：僅 2 人且意願相反 → 唯一可能的配對即為跨意願，0 人輪空", () => {
    const candidates = [
      candidate("U_A", { wantsBet: true }),
      candidate("U_B", { wantsBet: false }),
    ];
    const result = pairForDailyRun(candidates, { rng: fakeRng([0]) });
    expect(result).toEqual({
      pairs: [{ userAId: "U_A", userBId: "U_B", betIntentMatched: false }],
      byeUserIds: [],
    });
  });

  test("不重複、不漏人：7 人混合意願與優先層 → 每人恰好出現一次（配對或輪空），奇數恰 1 人輪空", () => {
    const candidates = [
      candidate("U1", { wantsBet: true, wasByeYesterday: true }),
      candidate("U2", { wantsBet: false }),
      candidate("U3", { wantsBet: true }),
      candidate("U4", { wantsBet: false, wasByeYesterday: true }),
      candidate("U5", { wantsBet: true }),
      candidate("U6", { wantsBet: false }),
      candidate("U7", { wantsBet: true }),
    ];
    // 呼叫次數：tier1 洗牌（size2）1 次＋tier2 洗牌（size5）4 次＋pickRandom 至多 3 次 = 至多 8。
    const result = pairForDailyRun(candidates, { rng: fakeRng([0, 0, 0, 0, 0, 0, 0, 0]) });
    expect(coveredUserIds(result)).toEqual(allUserIds(candidates));
    expect(result.byeUserIds).toHaveLength(1);
    expect(result.pairs).toHaveLength(3);
    const seen = new Set();
    for (const pair of result.pairs) {
      expect(seen.has(pair.userAId)).toBe(false);
      expect(seen.has(pair.userBId)).toBe(false);
      seen.add(pair.userAId);
      seen.add(pair.userBId);
    }
  });

  test("無輸入 mutate：呼叫後輸入陣列與各元素內容不變", () => {
    const candidates = [
      candidate("U_A", { wantsBet: true, wasByeYesterday: true }),
      candidate("U_B", { wantsBet: false }),
      candidate("U_C", { wantsBet: true }),
    ];
    const snapshot = JSON.parse(JSON.stringify(candidates));
    pairForDailyRun(candidates, { rng: fakeRng([0, 0, 0, 0]) });
    expect(candidates).toEqual(snapshot);
  });

  test("固定 rng 序列可重現：同輸入、同序列重跑多次輸出完全相同", () => {
    const candidates = [
      candidate("U1", { wantsBet: true, wasByeYesterday: true }),
      candidate("U2", { wantsBet: false }),
      candidate("U3", { wantsBet: true }),
      candidate("U4", { wantsBet: false, wasByeYesterday: true }),
      candidate("U5", { wantsBet: true }),
      candidate("U6", { wantsBet: false }),
      candidate("U7", { wantsBet: true }),
    ];
    const seq = [0.2, 0.6, 0.1, 0.55, 0.35, 0.75, 0.05, 0.9];
    const first = pairForDailyRun(candidates, { rng: fakeRng(seq) });
    const second = pairForDailyRun(candidates, { rng: fakeRng(seq) });
    expect(second).toEqual(first);
  });

  // --- Orchestrator 回報的兩個具體錯誤 ---

  test("昨日輪空優先高於下注意願：A(昨日bye,bet) B(昨日bye,no-bet) C(今日,bet) → 必為 A-B 配對、C bye", () => {
    // A、B 同屬「昨日輪空」優先層，C 是一般候選人。即使 A 的下注意願與 C 相同、與 B 不同，
    // R8 第一項（昨日輪空優先取得配對機會）高於第二項（同下注意願優先）：
    // 優先層要先把彼此配掉，不能因為跨層找到同意願對象就把優先層拆開。
    const candidates = [
      candidate("A", { wantsBet: true, wasByeYesterday: true }),
      candidate("B", { wantsBet: false, wasByeYesterday: true }),
      candidate("C", { wantsBet: true }),
    ];
    for (const rngValue of [0, 0.5, 0.9]) {
      const result = pairForDailyRun(candidates, { rng: fakeRng([rngValue]) });
      expect(result).toEqual({
        pairs: [{ userAId: "A", userBId: "B", betIntentMatched: false }],
        byeUserIds: ["C"],
      });
    }
  });

  test("同層同條件隨機不只是選 partner：3 位同層同意願候選人，固定 rng 可讓任一人成為 bye（非統計、可重現）", () => {
    const candidates = [
      candidate("A", { wantsBet: true }),
      candidate("B", { wantsBet: true }),
      candidate("C", { wantsBet: true }),
    ];
    expect(pairForDailyRun(candidates, { rng: fakeRng([0, 0, 0]) })).toEqual({
      pairs: [{ userAId: "A", userBId: "B", betIntentMatched: true }],
      byeUserIds: ["C"],
    });
    expect(pairForDailyRun(candidates, { rng: fakeRng([0, 0, 0.6]) })).toEqual({
      pairs: [{ userAId: "B", userBId: "C", betIntentMatched: true }],
      byeUserIds: ["A"],
    });
    expect(pairForDailyRun(candidates, { rng: fakeRng([0, 0.6, 0]) })).toEqual({
      pairs: [{ userAId: "A", userBId: "C", betIntentMatched: true }],
      byeUserIds: ["B"],
    });
  });

  test("優先層內同條件隨機一樣要洗牌：3 位皆昨日輪空、同意願，任一人皆可能 bye（可重現）", () => {
    const candidates = [
      candidate("A", { wantsBet: true, wasByeYesterday: true }),
      candidate("B", { wantsBet: true, wasByeYesterday: true }),
      candidate("C", { wantsBet: true, wasByeYesterday: true }),
    ];
    expect(pairForDailyRun(candidates, { rng: fakeRng([0, 0, 0]) }).byeUserIds).toEqual(["C"]);
    expect(pairForDailyRun(candidates, { rng: fakeRng([0, 0, 0.6]) }).byeUserIds).toEqual(["A"]);
    expect(pairForDailyRun(candidates, { rng: fakeRng([0, 0.6, 0]) }).byeUserIds).toEqual(["B"]);
  });

  test("bye 只能落在可行範圍內優先權最低的一層：3 位昨日輪空 + 1 位一般候選人（同意願）→ bye 必為一般候選人", () => {
    const candidates = [
      candidate("A", { wantsBet: true, wasByeYesterday: true }),
      candidate("B", { wantsBet: true, wasByeYesterday: true }),
      candidate("C", { wantsBet: true, wasByeYesterday: true }),
      candidate("D", { wantsBet: true }),
    ];
    for (const seq of [
      [0, 0, 0],
      [0.5, 0.5, 0.5],
      [0.9, 0.9, 0.9],
    ]) {
      const result = pairForDailyRun(candidates, { rng: fakeRng(seq) });
      expect(result.byeUserIds).toEqual([]);
      const tier1Paired = result.pairs.filter(
        p => ["A", "B", "C"].includes(p.userAId) && ["A", "B", "C"].includes(p.userBId)
      );
      expect(tier1Paired).toHaveLength(1);
    }
  });
});
