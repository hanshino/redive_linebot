require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const JankenDailyRewardLog = require("../JankenDailyRewardLog");

describe("JankenDailyRewardLog", () => {
  beforeEach(async () => {
    await mysql("janken_daily_reward_log").delete();
  });
  afterAll(() => mysql.destroy());

  test("tryInsert returns true on first insert, false on duplicate same-day", async () => {
    const args = {
      user_id: "U1",
      reward_date: "2026-05-01",
      season_id: 1,
      reward_type: "top1",
      amount: 500,
    };
    expect(await JankenDailyRewardLog.tryInsert(args)).toBe(true);
    expect(await JankenDailyRewardLog.tryInsert(args)).toBe(false);
    const count = await mysql("janken_daily_reward_log").count({ c: "*" }).first();
    expect(Number(count.c)).toBe(1);
  });

  test("getByUserAndDate returns the row when present", async () => {
    await JankenDailyRewardLog.tryInsert({
      user_id: "U2",
      reward_date: "2026-05-02",
      season_id: 1,
      reward_type: "challenger",
      amount: 10,
    });
    const row = await JankenDailyRewardLog.getByUserAndDate("U2", "2026-05-02");
    expect(row.amount).toBe(10);
    expect(row.reward_type).toBe("challenger");
  });

  test("getByUserAndDate returns undefined when missing", async () => {
    const row = await JankenDailyRewardLog.getByUserAndDate("U999", "2026-05-02");
    expect(row).toBeUndefined();
  });
});
