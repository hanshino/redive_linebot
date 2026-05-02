require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const JankenSeasonSnapshot = require("../JankenSeasonSnapshot");

describe("JankenSeasonSnapshot", () => {
  beforeEach(async () => {
    await mysql("janken_season_snapshot").delete();
  });
  afterAll(() => mysql.destroy());

  test("bulkInsert + getBySeason round-trips", async () => {
    await JankenSeasonSnapshot.bulkInsert(7, [
      {
        rank: 1,
        user_id: "U1",
        display_name: "A",
        elo: 1500,
        rank_tier: "master",
        win_count: 30,
        lose_count: 10,
        draw_count: 5,
        max_streak: 6,
      },
      {
        rank: 2,
        user_id: "U2",
        display_name: "B",
        elo: 1300,
        rank_tier: "fighter",
        win_count: 20,
        lose_count: 15,
        draw_count: 3,
        max_streak: 4,
      },
    ]);
    const rows = await JankenSeasonSnapshot.getBySeason(7);
    expect(rows).toHaveLength(2);
    expect(rows[0].rank).toBe(1);
    expect(rows[0].elo).toBe(1500);
  });

  test("bulkInsert with empty array is a no-op", async () => {
    await expect(JankenSeasonSnapshot.bulkInsert(8, [])).resolves.toBeUndefined();
    const rows = await JankenSeasonSnapshot.getBySeason(8);
    expect(rows).toHaveLength(0);
  });
});
