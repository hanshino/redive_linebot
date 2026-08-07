// SigninService — 日期規則 / streak / 扣款 / 重複簽到。
// 只 mock 到 knex 邊界（util/mysql 由全域 setup 提供 mock builder 的形狀概念），
// 這裡用一個小型 in-memory 假資料庫，讓交易語意（回滾 = 不留任何列）可被驗證。

const TODAY = "2026-08-07"; // 星期五，8 月有 31 天

jest.mock("../../src/util/date", () => ({
  todayUtc8: () => "2026-08-07",
  yesterdayUtc8: () => "2026-08-06",
  toUtc8Date: d => d,
  daysAgoUtc8: jest.fn(),
}));

jest.mock("../../src/model/princess/gacha", () => ({
  getUserGodStoneCount: jest.fn().mockResolvedValue(0),
}));

jest.mock("../../src/service/AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));

// --- 極簡 in-memory knex 替身 ------------------------------------------------
// 只支援本 service 用到的呼叫形狀。不是通用 knex 模擬器，壞掉會直接噴錯而不是
// 靜默回錯答案，這正是我們要的。
const db = { signin_ledger: [], inventory: [] };
let nextId = 1;
let failNextLedgerInsert = null;

function makeBuilder(table, staged) {
  const state = { table, wheres: [], raws: [] };
  const rows = () => staged[table];

  const matches = row =>
    state.wheres.every(w => {
      if (w.op === "=") return String(row[w.col]) === String(w.value);
      if (w.op === ">=") return String(row[w.col]) >= String(w.value);
      if (w.op === "<=") return String(row[w.col]) <= String(w.value);
      return false;
    });

  const builder = {
    where(arg, op, value) {
      if (typeof arg === "object") {
        Object.entries(arg).forEach(([col, v]) => state.wheres.push({ col, op: "=", value: v }));
      } else if (value === undefined) {
        state.wheres.push({ col: arg, op: "=", value: op });
      } else {
        state.wheres.push({ col: arg, op, value });
      }
      return builder;
    },
    andWhere(...args) {
      return builder.where(...args);
    },
    orderBy() {
      return builder;
    },
    forUpdate() {
      return builder;
    },
    select() {
      // 回傳 builder 本身（thenable），才能接 .forUpdate()；await 時才真的求值。
      return builder;
    },
    first() {
      const found = rows().find(matches);
      return Promise.resolve(found ? { ...found } : undefined);
    },
    insert(payload) {
      const list = Array.isArray(payload) ? payload : [payload];
      if (table === "signin_ledger") {
        if (failNextLedgerInsert) {
          const err = failNextLedgerInsert;
          failNextLedgerInsert = null;
          return Promise.reject(err);
        }
        for (const row of list) {
          const dup = rows().some(
            r => r.user_id === row.user_id && r.signin_date === row.signin_date
          );
          if (dup) {
            const err = new Error("Duplicate entry");
            err.code = "ER_DUP_ENTRY";
            return Promise.reject(err);
          }
        }
      }
      list.forEach(row => rows().push({ id: nextId++, ...row }));
      return Promise.resolve([nextId - 1]);
    },
    then(resolve, reject) {
      // service 用 DATE_FORMAT alias 取回字串日期；假資料本來就存字串。
      const found = rows()
        .filter(matches)
        .map(r => ({ ...r }));
      return Promise.resolve(found).then(resolve, reject);
    },
  };
  return builder;
}

jest.mock("../../src/util/mysql", () => {
  const knex = jest.fn(table => makeBuilder(table, knex._staged || db));
  knex.raw = jest.fn(sql => sql);
  knex.transaction = jest.fn(async cb => {
    // 交易 = 對快照操作，成功才 merge 回主資料；失敗整批丟棄。
    const staged = {
      signin_ledger: db.signin_ledger.map(r => ({ ...r })),
      inventory: db.inventory.map(r => ({ ...r })),
    };
    const trx = jest.fn(table => makeBuilder(table, staged));
    // 成功才 merge 回主資料；失敗時 staged 直接丟棄 = 回滾。
    const result = await cb(trx);
    db.signin_ledger = staged.signin_ledger;
    db.inventory = staged.inventory;
    return result;
  });
  return knex;
});

const SigninService = require("../../src/service/SigninService");
const AchievementEngine = require("../../src/service/AchievementEngine");

function seedSignins(userId, dates, source = "normal") {
  dates.forEach(date =>
    db.signin_ledger.push({
      id: nextId++,
      user_id: userId,
      signin_date: date,
      source,
      cost_stones: 0,
    })
  );
}

function seedStones(userId, amount) {
  db.inventory.push({ id: nextId++, userId, itemId: 999, itemAmount: amount });
}

const stoneRows = userId => db.inventory.filter(r => r.userId === userId && r.itemId === 999);
const balanceOf = userId => stoneRows(userId).reduce((a, r) => a + r.itemAmount, 0);

beforeEach(() => {
  db.signin_ledger = [];
  db.inventory = [];
  nextId = 1;
  failNextLedgerInsert = null;
  jest.clearAllMocks();
});

describe("computeStreak", () => {
  const streak = dates => SigninService._computeStreak(dates, TODAY);

  it("counts back from today when today is signed", () => {
    expect(streak(["2026-08-07", "2026-08-06", "2026-08-05"])).toBe(3);
  });

  it("counts back from yesterday when today is not signed yet", () => {
    expect(streak(["2026-08-06", "2026-08-05"])).toBe(2);
  });

  it("is 0 when neither today nor yesterday is signed", () => {
    expect(streak(["2026-08-05", "2026-08-04"])).toBe(0);
  });

  it("is 0 on an empty ledger", () => {
    expect(streak([])).toBe(0);
  });

  it("stops at the first gap", () => {
    expect(streak(["2026-08-07", "2026-08-06", "2026-08-04", "2026-08-03"])).toBe(2);
  });

  it("crosses a month boundary", () => {
    expect(streak(["2026-08-02", "2026-08-01", "2026-07-31"])).toBe(0);
    expect(
      SigninService._computeStreak(["2026-08-02", "2026-08-01", "2026-07-31"], "2026-08-02")
    ).toBe(3);
  });
});

describe("recordNormal", () => {
  it("inserts a normal row and reports created", async () => {
    const res = await SigninService.recordNormal("Ualice");
    expect(res).toEqual({ created: true, date: TODAY });
    expect(db.signin_ledger).toHaveLength(1);
    expect(db.signin_ledger[0]).toMatchObject({ source: "normal", cost_stones: 0 });
  });

  it("is idempotent for the same day (no duplicate row, created=false)", async () => {
    await SigninService.recordNormal("Ualice");
    const res = await SigninService.recordNormal("Ualice");
    expect(res.created).toBe(false);
    expect(db.signin_ledger).toHaveLength(1);
  });

  it("swallows a unique-key collision from a racing writer", async () => {
    const err = new Error("dup");
    err.code = "ER_DUP_ENTRY";
    failNextLedgerInsert = err;
    const res = await SigninService.recordNormal("Urace");
    expect(res.created).toBe(false);
  });

  it("accepts an explicit date", async () => {
    await SigninService.recordNormal("Ualice", { date: "2026-08-03" });
    expect(db.signin_ledger[0].signin_date).toBe("2026-08-03");
  });
});

describe("makeup date rules", () => {
  it.each([
    ["", "INVALID_DATE"],
    [undefined, "INVALID_DATE"],
    ["2026-8-3", "INVALID_DATE"],
    ["2026/08/03", "INVALID_DATE"],
    ["2026-02-31", "INVALID_DATE"],
    ["20260803", "INVALID_DATE"],
    ["2026-07-31", "NOT_CURRENT_MONTH"],
    ["2026-09-01", "NOT_CURRENT_MONTH"],
    ["2025-08-03", "NOT_CURRENT_MONTH"],
    [TODAY, "DATE_NOT_PAST"],
    ["2026-08-08", "DATE_NOT_PAST"],
  ])("rejects %s with %s", async (date, code) => {
    seedStones("Ualice", 999999);
    const res = await SigninService.makeup("Ualice", date);
    expect(res).toMatchObject({ ok: false, code });
    expect(db.signin_ledger).toHaveLength(0);
    expect(balanceOf("Ualice")).toBe(999999);
  });

  it("accepts yesterday", async () => {
    seedStones("Ualice", 50000);
    const res = await SigninService.makeup("Ualice", "2026-08-06");
    expect(res).toMatchObject({ ok: true, date: "2026-08-06", cost: 20000 });
  });
});

describe("makeup debit", () => {
  it("inserts ledger + a negative stone row of exactly the cost", async () => {
    seedStones("Ualice", 50000);
    await SigninService.makeup("Ualice", "2026-08-05");

    expect(db.signin_ledger).toHaveLength(1);
    expect(db.signin_ledger[0]).toMatchObject({
      signin_date: "2026-08-05",
      source: "makeup",
      cost_stones: 20000,
    });
    const debits = stoneRows("Ualice").filter(r => r.itemAmount < 0);
    expect(debits).toHaveLength(1);
    expect(debits[0].itemAmount).toBe(-20000);
    expect(balanceOf("Ualice")).toBe(30000);
  });

  it("rejects when balance is below cost and debits nothing", async () => {
    seedStones("Ualice", 19999);
    const res = await SigninService.makeup("Ualice", "2026-08-05");
    expect(res).toMatchObject({ ok: false, code: "INSUFFICIENT_STONES", cost: 20000 });
    expect(db.signin_ledger).toHaveLength(0);
    expect(balanceOf("Ualice")).toBe(19999);
  });

  it("rejects when the user has no stone rows at all", async () => {
    const res = await SigninService.makeup("Unew", "2026-08-05");
    expect(res.code).toBe("INSUFFICIENT_STONES");
    expect(db.inventory).toHaveLength(0);
  });

  it("sums a multi-row ledger balance rather than reading one row", async () => {
    seedStones("Ualice", 15000);
    seedStones("Ualice", 6000);
    const res = await SigninService.makeup("Ualice", "2026-08-05");
    expect(res.ok).toBe(true);
    expect(balanceOf("Ualice")).toBe(1000);
  });
});

describe("makeup duplicates", () => {
  it("returns ALREADY_SIGNED and does NOT debit when the date is already signed", async () => {
    seedSignins("Ualice", ["2026-08-05"]);
    seedStones("Ualice", 50000);

    const res = await SigninService.makeup("Ualice", "2026-08-05");

    expect(res).toEqual({ ok: false, code: "ALREADY_SIGNED" });
    expect(db.signin_ledger).toHaveLength(1);
    expect(balanceOf("Ualice")).toBe(50000);
  });

  it("does not double-debit when the unique key collides mid-transaction", async () => {
    // 模擬另一條請求在餘額檢查之後、insert 之前先寫入：ledger insert 撞唯一鍵，
    // 整筆交易回滾，扣款那列不得留下。
    seedStones("Ualice", 50000);
    const err = new Error("dup");
    err.code = "ER_DUP_ENTRY";
    failNextLedgerInsert = err;

    const res = await SigninService.makeup("Ualice", "2026-08-05");

    expect(res).toEqual({ ok: false, code: "ALREADY_SIGNED" });
    expect(balanceOf("Ualice")).toBe(50000);
    expect(db.inventory.filter(r => r.itemAmount < 0)).toHaveLength(0);
  });

  it("does not create a gacha record for a makeup signin", async () => {
    seedStones("Ualice", 50000);
    await SigninService.makeup("Ualice", "2026-08-05");
    expect(Object.keys(db)).toEqual(["signin_ledger", "inventory"]);
  });
});

describe("getSummary", () => {
  it("counts total across all months but monthCount only for the current month", async () => {
    seedSignins("Ualice", ["2026-07-30", "2026-08-01", "2026-08-07"]);
    const s = await SigninService.getSummary("Ualice");
    expect(s.total).toBe(3);
    expect(s.monthCount).toBe(2);
    expect(s.month).toBe("2026-08");
    expect(s.daysInMonth).toBe(31);
  });

  it("treats makeup rows as equal to normal ones for streak", async () => {
    seedSignins("Ualice", ["2026-08-07"], "normal");
    seedSignins("Ualice", ["2026-08-06", "2026-08-05"], "makeup");
    const s = await SigninService.getSummary("Ualice");
    expect(s.streak).toBe(3);
  });

  it("fullMonth is false until every day of the month has a row", async () => {
    const days = Array.from({ length: 30 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
    seedSignins("Ualice", days);
    expect((await SigninService.getSummary("Ualice")).fullMonth).toBe(false);

    seedSignins("Ualice", ["2026-08-31"]);
    expect((await SigninService.getSummary("Ualice")).fullMonth).toBe(true);
  });
});

describe("achievement evaluation", () => {
  it("passes the documented signin context", async () => {
    seedSignins("Ualice", ["2026-08-06", "2026-08-07"]);
    await SigninService.evaluateAchievements("Ualice", { source: "normal", date: TODAY });

    expect(AchievementEngine.evaluate).toHaveBeenCalledWith("Ualice", "signin", {
      source: "normal",
      date: TODAY,
      month: "2026-08",
      streak: 2,
      total: 2,
      monthCount: 2,
      daysInMonth: 31,
      fullMonth: false,
    });
  });

  it("carries the current month, not the month of the back-filled date", async () => {
    // 補簽的是過去某天，但 fullMonth 講的一律是「現在這個月」。
    seedStones("Ualice", 50000);
    await SigninService.makeup("Ualice", "2026-08-01");

    const [, , ctx] = AchievementEngine.evaluate.mock.calls[0];
    expect(ctx.month).toBe("2026-08");
    expect(ctx.date).toBe("2026-08-01");
  });

  it("fires with source=makeup after a successful makeup", async () => {
    seedStones("Ualice", 50000);
    await SigninService.makeup("Ualice", "2026-08-05");

    expect(AchievementEngine.evaluate).toHaveBeenCalledTimes(1);
    const [, event, ctx] = AchievementEngine.evaluate.mock.calls[0];
    expect(event).toBe("signin");
    expect(ctx).toMatchObject({ source: "makeup", date: "2026-08-05" });
  });

  it("does not fire when the makeup is rejected", async () => {
    seedStones("Ualice", 1);
    await SigninService.makeup("Ualice", "2026-08-05");
    expect(AchievementEngine.evaluate).not.toHaveBeenCalled();
  });

  it("swallows achievement failures so signin still succeeds", async () => {
    AchievementEngine.evaluate.mockRejectedValueOnce(new Error("engine down"));
    seedStones("Ualice", 50000);
    const res = await SigninService.makeup("Ualice", "2026-08-05");
    expect(res.ok).toBe(true);
    expect(res.unlocked).toEqual([]);
  });
});

describe("makeup returns newly unlocked achievements", () => {
  // 完整 DB row：makeup 回傳時必須被投影，內部欄位不得外流給前端
  const FULL_ROW = {
    id: 900,
    key: "secret",
    name: "全勤",
    icon: "🗓",
    rarity: 3,
    reward_stones: 500,
    category_key: "signin",
    description: "秘密條件",
    target_value: 31,
    category_id: 4,
    condition: { event: "signin", metric: "full_month", month: "2026-08" },
    notify_on_unlock: true,
    notify_message: "解鎖 {name}",
    created_at: "2026-01-01",
  };

  it("surfaces the unlocked achievements projected to the notice shape", async () => {
    AchievementEngine.evaluate.mockResolvedValueOnce({ unlocked: [FULL_ROW] });
    seedStones("Ualice", 50000);

    const res = await SigninService.makeup("Ualice", "2026-08-05");

    expect(res.ok).toBe(true);
    expect(res.unlocked).toEqual([
      {
        id: 900,
        key: "secret",
        name: "全勤",
        icon: "🗓",
        rarity: 3,
        reward_stones: 500,
        category_key: "signin",
      },
    ]);
    // 既有欄位不得被破壞
    expect(res.date).toBe("2026-08-05");
    expect(res.cost).toBe(20000);
  });

  it("never leaks condition / notify_message through the makeup result", async () => {
    AchievementEngine.evaluate.mockResolvedValueOnce({ unlocked: [FULL_ROW] });
    seedStones("Ualice", 50000);

    const res = await SigninService.makeup("Ualice", "2026-08-05");
    const json = JSON.stringify(res);

    ["condition", "notify_message", "notify_on_unlock", "category_id", "created_at"].forEach(k =>
      expect(res.unlocked[0]).not.toHaveProperty(k)
    );
    expect(json).not.toContain("full_month");
    expect(json).not.toContain("解鎖 {name}");
    expect(json).not.toContain("秘密條件");
  });

  it("returns an empty array when nothing unlocked", async () => {
    seedStones("Ualice", 50000);
    const res = await SigninService.makeup("Ualice", "2026-08-05");
    expect(res.unlocked).toEqual([]);
  });

  it("returns an empty array when the engine yields no unlocked key", async () => {
    AchievementEngine.evaluate.mockResolvedValueOnce({});
    seedStones("Ualice", 50000);
    const res = await SigninService.makeup("Ualice", "2026-08-05");
    expect(res.unlocked).toEqual([]);
  });

  it("does not attach unlocked to a rejected makeup", async () => {
    seedStones("Ualice", 1);
    const res = await SigninService.makeup("Ualice", "2026-08-05");
    expect(res.ok).toBe(false);
    expect(res.unlocked).toBeUndefined();
  });

  it("still hands raw rows to internal callers via evaluateAchievements", async () => {
    // notifyUnlocks 需要 notify_message / notify_on_unlock，內部路徑不可被投影破壞
    AchievementEngine.evaluate.mockResolvedValueOnce({ unlocked: [FULL_ROW] });

    const res = await SigninService.evaluateAchievements("Ualice", {
      source: "normal",
      date: TODAY,
    });

    expect(res.unlocked[0]).toHaveProperty("notify_message", "解鎖 {name}");
    expect(res.unlocked[0]).toHaveProperty("notify_on_unlock", true);
  });
});
