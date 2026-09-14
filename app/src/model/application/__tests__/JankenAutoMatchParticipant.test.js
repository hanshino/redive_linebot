// KTD2 participant manifest 的真實 DB 證據：(run_date, user_id) PK、FK 到 run、status 單向 CAS。
// 用 worldBossFixture 在本機 Docker MySQL 建拋棄式 DB（Princess_wbtest_*），結束只 DROP 自己。
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
if (!["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
  throw new Error(`refuse: DB_HOST is not local (${process.env.DB_HOST})`);
}
const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../../__tests__/helpers/worldBossFixture");

const testDatabase = createWorldBossTestDatabase("ajm_participant");
const mysql = testDatabase.mysql;
jest.mock("../../../util/mysql", () => mysql);

const JankenAutoMatchRun = require("../JankenAutoMatchRun");
const Participant = require("../JankenAutoMatchParticipant");
const { STATUS } = Participant;

const RUN_DATE = "2026-09-13";
const U = ch => "U" + ch.repeat(32);

function matchedRows(matchId, [a, b], overrides = {}) {
  return [
    {
      run_date: RUN_DATE,
      user_id: a,
      match_id: matchId,
      role: "p1",
      opponent_user_id: b,
      choice: "rock",
      match_generation: 1,
      bet_enabled: true,
      bet_generation: 2,
      bet_cap: 500,
      status: STATUS.NOT_STARTED,
      ...overrides,
    },
    {
      run_date: RUN_DATE,
      user_id: b,
      match_id: matchId,
      role: "p2",
      opponent_user_id: a,
      choice: "paper",
      match_generation: 3,
      bet_enabled: false,
      bet_generation: 0,
      bet_cap: 0,
      status: STATUS.NOT_STARTED,
      ...overrides,
    },
  ];
}

async function statusesOf(matchId) {
  const rows = await Participant.findByMatchId(matchId);
  return rows.map(r => r.status);
}

describe("JankenAutoMatchParticipant (isolated DB)", () => {
  beforeAll(async () => {
    await testDatabase.setup();
    await JankenAutoMatchRun.tryClaim(RUN_DATE);
  }, SETUP_TIMEOUT_MS);
  afterAll(() => testDatabase.teardown());

  test("manifest 與 claim 同交易寫入；rollback 全部不落地", async () => {
    await expect(
      mysql.transaction(async trx => {
        expect(await JankenAutoMatchRun.tryClaim("2026-09-20", trx)).toBe(true);
        await Participant.insertManifest(
          matchedRows("m-rollback", [U("a"), U("b")], { run_date: "2026-09-20" }),
          trx
        );
        throw new Error("simulated");
      })
    ).rejects.toThrow("simulated");
    expect(await JankenAutoMatchRun.findByDate("2026-09-20")).toBeUndefined();
    expect(await Participant.findByMatchId("m-rollback")).toHaveLength(0);
  });

  test("(run_date, user_id) 撞 PK 得 ER_DUP_ENTRY（同一天同一人不能進兩場）", async () => {
    await Participant.insertManifest(matchedRows("m-pk", [U("c"), U("d")]));
    await expect(
      Participant.insertManifest(matchedRows("m-pk-2", [U("c"), U("e")]))
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    expect(await Participant.findByUserAndDate(U("e"), RUN_DATE)).toBeUndefined();
  });

  test("沒有 run claim 的 run_date 不能寫 manifest（FK）", async () => {
    await expect(
      Participant.insertManifest([
        {
          run_date: "2030-01-01",
          user_id: U("f"),
          match_generation: 1,
          status: STATUS.BYE,
        },
      ])
    ).rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" });
  });

  test("bye 列：match_id/role/opponent/choice 皆 null，且 CAS 對它無效", async () => {
    await Participant.insertManifest([
      { run_date: RUN_DATE, user_id: U("g"), match_generation: 1, status: STATUS.BYE },
    ]);
    const row = await Participant.findByUserAndDate(U("g"), RUN_DATE);
    expect(row).toMatchObject({
      match_id: null,
      role: null,
      opponent_user_id: null,
      choice: null,
      status: "bye",
      bet_enabled: 0,
      bet_generation: 0,
      bet_cap: 0,
    });
    expect(await Participant.findByeUserIds(RUN_DATE)).toEqual([U("g")]);
  });

  test("not_started → completed：兩列同時推進，之後 markFailed 無效（單向）", async () => {
    await Participant.insertManifest(matchedRows("m-ok", [U("h"), U("i")]));
    const affected = await mysql.transaction(trx => Participant.markCompleted("m-ok", trx));
    expect(affected).toBe(2);
    expect(await statusesOf("m-ok")).toEqual(["completed", "completed"]);

    expect(await Participant.markFailed("m-ok")).toBe(0);
    expect(await Participant.markCompleted("m-ok")).toBe(0);
    expect(await statusesOf("m-ok")).toEqual(["completed", "completed"]);
  });

  test("not_started → failed：之後 markCompleted 無效（單向）", async () => {
    await Participant.insertManifest(matchedRows("m-fail", [U("j"), U("k")]));
    expect(await Participant.markFailed("m-fail")).toBe(2);
    expect(await Participant.markCompleted("m-fail")).toBe(0);
    expect(await statusesOf("m-fail")).toEqual(["failed", "failed"]);
  });

  test("markCompleted 與結算同 trx rollback 後仍是 not_started，再 CAS failed 成功", async () => {
    await Participant.insertManifest(matchedRows("m-rb", [U("l"), U("m")]));
    await expect(
      mysql.transaction(async trx => {
        expect(await Participant.markCompleted("m-rb", trx)).toBe(2);
        throw new Error("settle failed");
      })
    ).rejects.toThrow("settle failed");
    expect(await statusesOf("m-rb")).toEqual(["not_started", "not_started"]);
    expect(await Participant.markFailed("m-rb")).toBe(2);
  });

  test("manifest 快照欄位原樣落地（不可變資料的讀回）", async () => {
    await Participant.insertManifest(matchedRows("m-snap", [U("n"), U("o")]));
    const [p1, p2] = await Participant.findByMatchId("m-snap");
    expect(p1).toMatchObject({
      user_id: U("n"),
      role: "p1",
      opponent_user_id: U("o"),
      choice: "rock",
      match_generation: 1,
      bet_enabled: 1,
      bet_generation: 2,
      bet_cap: 500,
    });
    expect(p2).toMatchObject({ user_id: U("o"), role: "p2", opponent_user_id: U("n") });
  });

  test("status 不接受 enum 以外的值", async () => {
    await expect(
      Participant.insertManifest([
        { run_date: RUN_DATE, user_id: U("p"), match_generation: 1, status: "pending" },
      ])
    ).rejects.toMatchObject({
      code: expect.stringMatching(/^(WARN_DATA_TRUNCATED|ER_TRUNCATED_WRONG_VALUE_FOR_FIELD)$/),
    });
  });
});
