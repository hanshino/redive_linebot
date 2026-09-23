// KTD1 durable claim 的真實 DB 證據：普通 INSERT 撞 run_date PK 得 ER_DUP_ENTRY。
// 用 worldBossFixture 在本機 Docker MySQL 建拋棄式 DB（Princess_wbtest_*）跑完整 migration，結束只 DROP 自己。
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
if (!["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
  throw new Error(`refuse: DB_HOST is not local (${process.env.DB_HOST})`);
}
const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../../__tests__/helpers/worldBossFixture");

const testDatabase = createWorldBossTestDatabase("ajm_run");
const mysql = testDatabase.mysql;
jest.mock("../../../util/mysql", () => mysql);

const JankenAutoMatchRun = require("../JankenAutoMatchRun");

describe("JankenAutoMatchRun (isolated DB)", () => {
  beforeAll(() => testDatabase.setup(), SETUP_TIMEOUT_MS);
  afterAll(() => testDatabase.teardown());

  test("同一 run_date 第二次普通 INSERT 得 ER_DUP_ENTRY", async () => {
    await mysql("janken_auto_match_run").insert({ run_date: "2026-09-13" });
    await expect(
      mysql("janken_auto_match_run").insert({ run_date: "2026-09-13" })
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    const rows = await mysql("janken_auto_match_run").where({ run_date: "2026-09-13" });
    expect(rows).toHaveLength(1);
  });

  test("tryClaim：第一次 true、第二次 false；在交易內撞鍵不會讓交易失效", async () => {
    await expect(JankenAutoMatchRun.tryClaim("2026-09-14")).resolves.toBe(true);

    const seen = await mysql.transaction(async trx => {
      const claimed = await JankenAutoMatchRun.tryClaim("2026-09-14", trx);
      // 撞鍵後同一 trx 仍可正常查詢並 commit
      const row = await JankenAutoMatchRun.findByDate("2026-09-14", trx);
      return { claimed, row };
    });
    expect(seen.claimed).toBe(false);
    expect(seen.row).toBeDefined();
    expect(await mysql("janken_auto_match_run").where({ run_date: "2026-09-14" })).toHaveLength(1);
  });

  test("兩條真實連線同時 claim 同一天只有一個成功", async () => {
    const results = await Promise.all([
      JankenAutoMatchRun.tryClaim("2026-09-15"),
      JankenAutoMatchRun.tryClaim("2026-09-15"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test("claim 交易 rollback 後當天可再被 claim（沒有幽靈 claim）", async () => {
    await expect(
      mysql.transaction(async trx => {
        expect(await JankenAutoMatchRun.tryClaim("2026-09-16", trx)).toBe(true);
        throw new Error("simulated manifest failure");
      })
    ).rejects.toThrow("simulated manifest failure");
    expect(await JankenAutoMatchRun.findByDate("2026-09-16")).toBeUndefined();
    await expect(JankenAutoMatchRun.tryClaim("2026-09-16")).resolves.toBe(true);
  });
});
