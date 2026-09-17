// KTD4 outbox 唯一鍵 (match_id, role, event_name) 的真實 DB 證據。
// 用 worldBossFixture 在本機 Docker MySQL 建拋棄式 DB（Princess_wbtest_*），結束只 DROP 自己。
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
if (!["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
  throw new Error(`refuse: DB_HOST is not local (${process.env.DB_HOST})`);
}
const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../../__tests__/helpers/worldBossFixture");

const testDatabase = createWorldBossTestDatabase("ajm_outbox");
const mysql = testDatabase.mysql;
jest.mock("../../../util/mysql", () => mysql);

const Outbox = require("../JankenAutoMatchOutbox");

const U = ch => "U" + ch.repeat(32);
const NOW = new Date("2026-09-13T21:00:05+08:00");
const event = (matchId, role, eventName, extra = {}) => ({
  match_id: matchId,
  role,
  event_name: eventName,
  run_date: "2026-09-13",
  user_id: role === "p1" ? U("a") : U("b"),
  occurred_at: NOW,
  payload: { result: "win", feature: "auto" },
  ...extra,
});

describe("JankenAutoMatchOutbox (isolated DB)", () => {
  beforeAll(() => testDatabase.setup(), SETUP_TIMEOUT_MS);
  afterAll(() => testDatabase.teardown());

  test("p2 勝出：同 match 同 role 的 janken_win + janken_challenge 不撞鍵", async () => {
    await mysql.transaction(trx =>
      Outbox.insertEvents(
        [event("m-p2win", "p2", "janken_win"), event("m-p2win", "p2", "janken_challenge")],
        trx
      )
    );
    const rows = await mysql("janken_auto_match_outbox")
      .where({ match_id: "m-p2win" })
      .orderBy("event_name");
    expect(rows.map(r => [r.role, r.event_name])).toEqual([
      ["p2", "janken_challenge"],
      ["p2", "janken_win"],
    ]);
    expect(rows[0]).toMatchObject({ attempts: 0, last_error: null, processed_at: null });
    expect(rows[0].payload).toEqual({ result: "win", feature: "auto" });
  });

  test("同一 (match_id, role, event_name) 重複寫入得 ER_DUP_ENTRY", async () => {
    await Outbox.insertEvents([event("m-dup", "p1", "janken_win")]);
    await expect(
      Outbox.insertEvents([event("m-dup", "p1", "janken_win", { user_id: U("z") })])
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    expect(await mysql("janken_auto_match_outbox").where({ match_id: "m-dup" })).toHaveLength(1);
  });

  test("不同 role 同事件名可共存（p1 janken_win 與 p2 janken_win 是兩列）", async () => {
    await Outbox.insertEvents([
      event("m-roles", "p1", "janken_win"),
      event("m-roles", "p2", "janken_win"),
    ]);
    expect(await mysql("janken_auto_match_outbox").where({ match_id: "m-roles" })).toHaveLength(2);
  });

  test("與結算同 trx rollback 後不落地", async () => {
    await expect(
      mysql.transaction(async trx => {
        await Outbox.insertEvents([event("m-rb", "p1", "janken_win")], trx);
        expect(await trx("janken_auto_match_outbox").where({ match_id: "m-rb" })).toHaveLength(1);
        throw new Error("simulated");
      })
    ).rejects.toThrow("simulated");
    expect(await mysql("janken_auto_match_outbox").where({ match_id: "m-rb" })).toHaveLength(0);
  });
});
