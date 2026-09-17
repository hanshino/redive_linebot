// U1 資料層的無 DB 單元測試（docs/plans/2026-09-12-001-feat-auto-janken-matchmaking-plan.md U1）。
//
// 這裡只驗證「不需要 DB 也能判定」的契約：
//   - optional trx：有傳就走 trx、沒傳就走全域 mysql（JankenRecords / JankenResult / base 系 model）
//   - tryClaim 只把 ER_DUP_ENTRY 轉成 false，其他錯誤原樣 throw
//   - participant CAS 的 SQL 形狀：只從 not_started 出發、只改 status
// 用未連線的真 knex(mysql2) 產 SQL，不 mock query builder。
// 真實 PK 撞鍵 / rollback 不落地 / source 預設 manual 由同目錄 *.test.js 隔離 DB 測試負責。
const knex = require("knex");

const mysql = require("../../../util/mysql"); // 全域 setup.js 的 mock knex
const JankenRecords = require("../JankenRecords");
const JankenResult = require("../JankenResult");
const JankenAutoMatchRun = require("../JankenAutoMatchRun");
const JankenAutoMatchParticipant = require("../JankenAutoMatchParticipant");
const JankenAutoMatchOutbox = require("../JankenAutoMatchOutbox");
const UserAutoPreference = require("../UserAutoPreference");
const SubscribeUser = require("../SubscribeUser");

const sqlOnly = knex({ client: "mysql2" }); // 不連線，只拿 toSQL()

function fakeTrx() {
  const builder = {
    insert: jest.fn().mockResolvedValue([1]),
    update: jest.fn(() => builder),
    where: jest.fn(() => builder),
  };
  const trx = jest.fn(() => builder);
  trx.builder = builder;
  return trx;
}

afterEach(() => jest.clearAllMocks());

test("subscription renewal locks all card rows in id order on the supplied transaction", () => {
  const { sql, bindings } = SubscribeUser.lockAllByUser("U1", sqlOnly).toSQL().toNative();
  expect(sql).toBe(
    "select * from `subscribe_user` where `user_id` = ? order by `id` asc for update"
  );
  expect(bindings).toEqual(["U1"]);
  expect(SubscribeUser.findAllByUser("U1", sqlOnly).toSQL().sql).not.toContain("for update");
  expect(mysql).not.toHaveBeenCalled();
});

describe("optional trx 傳遞", () => {
  test("JankenRecords.create / update：有 trx 走 trx，沒 trx 走全域 mysql", async () => {
    const trx = fakeTrx();
    await JankenRecords.create({ id: "m1", user_id: "U1", target_user_id: "U2" }, trx);
    expect(trx).toHaveBeenCalledWith("janken_records");
    expect(mysql).not.toHaveBeenCalled();

    await JankenRecords.create({ id: "m2", user_id: "U1", target_user_id: "U2" });
    expect(mysql).toHaveBeenCalledWith("janken_records");

    mysql.mockClear();
    await JankenRecords.update("m1", { elo_change: 3 }, trx);
    expect(trx.builder.update).toHaveBeenCalledWith({ elo_change: 3 });
    expect(mysql).not.toHaveBeenCalled();
  });

  test("JankenRecords.create 會透過 fillable 帶入 source，未給時不送 source（交給 DB 預設 manual）", async () => {
    const trx = fakeTrx();
    await JankenRecords.create({ id: "m1", user_id: "U1", target_user_id: "U2" }, trx);
    expect(trx.builder.insert.mock.calls[0][0]).not.toHaveProperty("source");

    await JankenRecords.create(
      { id: "m2", user_id: "U1", target_user_id: "U2", source: JankenRecords.SOURCE.AUTO },
      trx
    );
    expect(trx.builder.insert.mock.calls[1][0]).toMatchObject({ source: "auto" });
  });

  test("JankenResult.insert / create：有 trx 走 trx，沒 trx 走全域 mysql", async () => {
    const trx = fakeTrx();
    await JankenResult.insert([{ record_id: "m1", user_id: "U1", result: 1, extra: "x" }], trx);
    expect(trx).toHaveBeenCalledWith("janken_result");
    expect(trx.builder.insert).toHaveBeenCalledWith([
      { record_id: "m1", user_id: "U1", result: 1 },
    ]);
    expect(mysql).not.toHaveBeenCalled();

    await JankenResult.insert([{ record_id: "m1", user_id: "U1", result: 1 }]);
    expect(mysql).toHaveBeenCalledWith("janken_result");
  });

  test("base 系新 model：qb(trx) 綁對表名", () => {
    const trx = fakeTrx();
    JankenAutoMatchRun.qb(trx);
    JankenAutoMatchParticipant.qb(trx);
    JankenAutoMatchOutbox.qb(trx);
    UserAutoPreference.qb(trx);
    expect(trx.mock.calls.map(c => c[0])).toEqual([
      "janken_auto_match_run",
      "janken_auto_match_participant",
      "janken_auto_match_outbox",
      "user_auto_preference",
    ]);
  });
});

describe("JankenAutoMatchRun.tryClaim", () => {
  test("插入成功回 true", async () => {
    const trx = fakeTrx();
    await expect(JankenAutoMatchRun.tryClaim("2026-09-13", trx)).resolves.toBe(true);
    expect(trx.builder.insert).toHaveBeenCalledWith({ run_date: "2026-09-13" });
  });

  test("ER_DUP_ENTRY 回 false（當天已有 claim）", async () => {
    const trx = fakeTrx();
    trx.builder.insert.mockRejectedValue(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));
    await expect(JankenAutoMatchRun.tryClaim("2026-09-13", trx)).resolves.toBe(false);
  });

  test("其他錯誤原樣 throw，不吞", async () => {
    const trx = fakeTrx();
    const boom = Object.assign(new Error("lock"), { code: "ER_LOCK_DEADLOCK" });
    trx.builder.insert.mockRejectedValue(boom);
    await expect(JankenAutoMatchRun.tryClaim("2026-09-13", trx)).rejects.toBe(boom);
  });
});

describe("JankenAutoMatchParticipant CAS SQL 形狀", () => {
  test("markCompleted / markFailed 只從 not_started 出發、只更新 status", () => {
    for (const [fn, to] of [
      ["markCompleted", "completed"],
      ["markFailed", "failed"],
    ]) {
      const { sql, bindings } = JankenAutoMatchParticipant[fn]("m1", sqlOnly).toSQL().toNative();
      expect(sql).toBe(
        "update `janken_auto_match_participant` set `status` = ? where `match_id` = ? and `status` = ?"
      );
      expect(bindings).toEqual([to, "m1", "not_started"]);
    }
  });

  test("lockByMatchId 依 user_id ASC 且 FOR UPDATE", () => {
    const { sql } = JankenAutoMatchParticipant.lockByMatchId("m1", sqlOnly).toSQL().toNative();
    expect(sql).toBe(
      "select * from `janken_auto_match_participant` where `match_id` = ? order by `user_id` asc for update"
    );
  });

  test("insertManifest 只帶 fillable 欄位", async () => {
    const trx = fakeTrx();
    await JankenAutoMatchParticipant.insertManifest(
      [{ run_date: "2026-09-13", user_id: "U1", status: "bye", match_generation: 1, junk: 1 }],
      trx
    );
    expect(trx.builder.insert).toHaveBeenCalledWith([
      { run_date: "2026-09-13", user_id: "U1", status: "bye", match_generation: 1 },
    ]);
  });
});

describe("JankenAutoMatchOutbox.insertEvents", () => {
  test("payload 物件會 JSON.stringify，字串／null 原樣", async () => {
    const trx = fakeTrx();
    await JankenAutoMatchOutbox.insertEvents(
      [
        { match_id: "m1", role: "p1", event_name: "janken_win", payload: { result: "win" } },
        { match_id: "m1", role: "p2", event_name: "janken_challenge", payload: "{}" },
        { match_id: "m1", role: "p2", event_name: "janken_win", payload: null },
      ],
      trx
    );
    const rows = trx.builder.insert.mock.calls[0][0];
    expect(rows[0].payload).toBe('{"result":"win"}');
    expect(rows[1].payload).toBe("{}");
    expect(rows[2].payload).toBeNull();
  });
});

describe("UserAutoPreference", () => {
  test("fillable 含新增的五個欄位", () => {
    expect(UserAutoPreference.fillable).toEqual(
      expect.arrayContaining([
        "auto_match_enabled",
        "auto_match_generation",
        "auto_match_bet_enabled",
        "auto_match_bet_generation",
        "auto_match_bet_cap",
      ])
    );
  });

  test("lockByUserId 是 FOR UPDATE 的單列讀", () => {
    const { sql } = UserAutoPreference.lockByUserId("U1", sqlOnly).toSQL().toNative();
    expect(sql).toBe("select * from `user_auto_preference` where `user_id` = ? limit ? for update");
  });
});
