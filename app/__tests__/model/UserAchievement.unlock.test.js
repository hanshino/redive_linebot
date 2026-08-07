// UserAchievement.unlock 的契約：回傳「這次是否真的 INSERT」。
// knex.raw 對 INSERT IGNORE 會 resolve 成 [ResultSetHeader, fields]，
// affectedRows 命中為 1、被唯一鍵忽略為 0（已對真實 MySQL 驗證過）。
jest.mock("../../src/util/mysql", () => {
  const knex = jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(null),
  }));
  knex.raw = jest.fn();
  return knex;
});

const mysql = require("../../src/util/mysql");
const UserAchievement = require("../../src/model/application/UserAchievement");

beforeEach(() => jest.clearAllMocks());

describe("UserAchievement.unlock", () => {
  it("returns true when the INSERT IGNORE created a row", async () => {
    mysql.raw.mockResolvedValue([{ affectedRows: 1, insertId: 12 }, undefined]);

    await expect(UserAchievement.unlock("Uabc", 7)).resolves.toBe(true);
  });

  it("returns false when the unique key made MySQL ignore the insert", async () => {
    mysql.raw.mockResolvedValue([{ affectedRows: 0, insertId: 0 }, undefined]);

    await expect(UserAchievement.unlock("Uabc", 7)).resolves.toBe(false);
  });

  it("issues INSERT IGNORE with bound params (no interpolation)", async () => {
    mysql.raw.mockResolvedValue([{ affectedRows: 1 }, undefined]);

    await UserAchievement.unlock("Uabc", 7);

    const [sql, bindings] = mysql.raw.mock.calls[0];
    expect(sql).toContain("INSERT IGNORE INTO user_achievements");
    expect(bindings).toEqual(["Uabc", 7]);
  });

  it("tolerates a bare header object instead of the [header, fields] tuple", async () => {
    // 某些 driver/mock 會直接回 header；不該因此把成功誤判成失敗。
    mysql.raw.mockResolvedValue({ affectedRows: 1 });

    await expect(UserAchievement.unlock("Uabc", 7)).resolves.toBe(true);
  });

  it("treats a missing/!unknown affectedRows as 'not created' (fail closed)", async () => {
    // 寧可漏發獎也不要重複發獎。
    mysql.raw.mockResolvedValue([{}, undefined]);
    await expect(UserAchievement.unlock("Uabc", 7)).resolves.toBe(false);

    mysql.raw.mockResolvedValue(undefined);
    await expect(UserAchievement.unlock("Uabc", 7)).resolves.toBe(false);
  });
});
