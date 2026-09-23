// JankenRecords optional trx 與 `source` 預設的真實 DB 證據（KTD3 models optional trx、KTD13）。
// 用 worldBossFixture 在本機 Docker MySQL 建拋棄式 DB（Princess_wbtest_*），結束只 DROP 自己。
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
if (!["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
  throw new Error(`refuse: DB_HOST is not local (${process.env.DB_HOST})`);
}
const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../../__tests__/helpers/worldBossFixture");

const testDatabase = createWorldBossTestDatabase("ajm_records");
const mysql = testDatabase.mysql;
jest.mock("../../../util/mysql", () => mysql);

const JankenRecords = require("../JankenRecords");

const U = ch => "U" + ch.repeat(32);
const base = id => ({ id, user_id: U("a"), target_user_id: U("b"), bet_amount: 0, bet_fee: 0 });

describe("JankenRecords trx / source (isolated DB)", () => {
  beforeAll(() => testDatabase.setup(), SETUP_TIMEOUT_MS);
  afterAll(() => testDatabase.teardown());

  test("不帶 trx：行為不變，source 由 DB 預設 manual（含 update）", async () => {
    await JankenRecords.create(base("r-plain"));
    expect(await JankenRecords.find("r-plain")).toMatchObject({ source: "manual" });

    await JankenRecords.update("r-plain", { elo_change: 12 });
    expect(await JankenRecords.find("r-plain")).toMatchObject({ elo_change: 12, source: "manual" });
  });

  test("source 可明確寫 arena / auto；非法值被 enum 拒絕", async () => {
    await JankenRecords.create({ ...base("r-arena"), source: JankenRecords.SOURCE.ARENA });
    await JankenRecords.create({ ...base("r-auto"), source: JankenRecords.SOURCE.AUTO });
    expect(await JankenRecords.find("r-arena")).toMatchObject({ source: "arena" });
    expect(await JankenRecords.find("r-auto")).toMatchObject({ source: "auto" });
    await expect(JankenRecords.create({ ...base("r-bad"), source: "bot" })).rejects.toMatchObject({
      code: expect.stringMatching(/^(WARN_DATA_TRUNCATED|ER_TRUNCATED_WRONG_VALUE_FOR_FIELD)$/),
    });
  });

  test("帶 trx：rollback 後 create 與 update 都不落地", async () => {
    await JankenRecords.create(base("r-existing"));
    await expect(
      mysql.transaction(async trx => {
        await JankenRecords.create(base("r-trx"), trx);
        await JankenRecords.update("r-existing", { bounty_won: 99 }, trx);
        // 交易內可見
        expect(await trx("janken_records").where({ id: "r-trx" }).first()).toBeDefined();
        throw new Error("simulated");
      })
    ).rejects.toThrow("simulated");

    expect(await JankenRecords.find("r-trx")).toBeUndefined();
    expect(await JankenRecords.find("r-existing")).toMatchObject({ bounty_won: null });
  });

  test("帶 trx：commit 後落地", async () => {
    await mysql.transaction(async trx => {
      await JankenRecords.create({ ...base("r-commit"), source: "auto" }, trx);
    });
    expect(await JankenRecords.find("r-commit")).toMatchObject({ source: "auto" });
  });
});
