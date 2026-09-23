// JankenResult optional trx 的真實 DB 證據（KTD3 models optional trx）。
// 用 worldBossFixture 在本機 Docker MySQL 建拋棄式 DB（Princess_wbtest_*），結束只 DROP 自己。
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
if (!["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
  throw new Error(`refuse: DB_HOST is not local (${process.env.DB_HOST})`);
}
const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../../__tests__/helpers/worldBossFixture");

const testDatabase = createWorldBossTestDatabase("ajm_result");
const mysql = testDatabase.mysql;
jest.mock("../../../util/mysql", () => mysql);

const JankenResult = require("../JankenResult");

const U = ch => "U" + ch.repeat(32);
const pair = recordId => [
  { record_id: recordId, user_id: U("a"), result: JankenResult.resultMap.win },
  { record_id: recordId, user_id: U("b"), result: JankenResult.resultMap.lose },
];

describe("JankenResult trx (isolated DB)", () => {
  beforeAll(() => testDatabase.setup(), SETUP_TIMEOUT_MS);
  afterAll(() => testDatabase.teardown());

  test("不帶 trx：insert / create 行為不變", async () => {
    await JankenResult.insert(pair("x-plain"));
    await JankenResult.create({ record_id: "x-plain-2", user_id: U("c"), result: 0 });
    expect(await mysql("janken_result").where({ record_id: "x-plain" })).toHaveLength(2);
    expect(await mysql("janken_result").where({ record_id: "x-plain-2" })).toHaveLength(1);
  });

  test("帶 trx：rollback 後兩列都不落地（janken_result 與結算同進退）", async () => {
    await expect(
      mysql.transaction(async trx => {
        await JankenResult.insert(pair("x-rb"), trx);
        expect(await trx("janken_result").where({ record_id: "x-rb" })).toHaveLength(2);
        throw new Error("simulated");
      })
    ).rejects.toThrow("simulated");
    expect(await mysql("janken_result").where({ record_id: "x-rb" })).toHaveLength(0);
  });

  test("帶 trx：commit 後落地", async () => {
    await mysql.transaction(trx => JankenResult.insert(pair("x-ok"), trx));
    expect(await mysql("janken_result").where({ record_id: "x-ok" })).toHaveLength(2);
  });
});
