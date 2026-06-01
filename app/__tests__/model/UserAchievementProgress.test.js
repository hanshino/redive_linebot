// Unit test for the batch upsert SQL contract. jest.mock is NOT hoisted here
// (app jest config uses transform:{}), so the mock must precede the require.
jest.mock("../../src/util/mysql", () => {
  const knex = jest.fn();
  knex.raw = jest.fn().mockResolvedValue([{}]);
  // base.js calls mysql.transactionProvider() at module load.
  knex.transactionProvider = jest.fn(() => jest.fn());
  return knex;
});

const mysql = require("../../src/util/mysql");
const UserProgress = require("../../src/model/application/UserAchievementProgress");

describe("UserAchievementProgress.upsertMany", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is a no-op (no SQL) for an empty or non-array argument", async () => {
    expect(await UserProgress.upsertMany([])).toBeUndefined();
    expect(await UserProgress.upsertMany(undefined)).toBeUndefined();
    expect(mysql.raw).not.toHaveBeenCalled();
  });

  it("emits one parameter-bound INSERT...ON DUPLICATE KEY UPDATE for a single row", async () => {
    await UserProgress.upsertMany([{ userId: "U1", achievementId: 7, currentValue: 42 }]);

    expect(mysql.raw).toHaveBeenCalledTimes(1);
    const [sql, bindings] = mysql.raw.mock.calls[0];
    const groups = sql.match(/\(\?, \?, \?, NOW\(\)\)/g) || [];
    expect(groups).toHaveLength(1);
    expect(sql).toMatch(/INSERT INTO user_achievement_progress/);
    expect(sql).toMatch(/ON DUPLICATE KEY UPDATE current_value = VALUES\(current_value\)/);
    expect(bindings).toEqual(["U1", 7, 42]);
  });

  it("flattens many rows into one statement with bindings in row order", async () => {
    await UserProgress.upsertMany([
      { userId: "U1", achievementId: 1, currentValue: 10 },
      { userId: "U1", achievementId: 2, currentValue: 20 },
      { userId: "U2", achievementId: 3, currentValue: 30 },
    ]);

    expect(mysql.raw).toHaveBeenCalledTimes(1);
    const [sql, bindings] = mysql.raw.mock.calls[0];
    const groups = sql.match(/\(\?, \?, \?, NOW\(\)\)/g) || [];
    expect(groups).toHaveLength(3);
    // 3 columns × 3 rows = 9 bindings, flattened in (userId, achievementId, currentValue) order
    expect(bindings).toEqual(["U1", 1, 10, "U1", 2, 20, "U2", 3, 30]);
    expect(bindings).toHaveLength(groups.length * 3);
  });
});
