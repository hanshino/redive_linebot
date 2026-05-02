const DailyRewards = require("../JankenDailyRewards");

describe("JankenDailyRewards CLI", () => {
  test("computeRewardDate returns yesterday in YYYY-MM-DD (Asia/Taipei)", () => {
    const now = new Date("2026-05-02T03:00:00+08:00");
    expect(DailyRewards.computeRewardDate(now)).toBe("2026-05-01");
  });
  test("computeRewardDate around midnight TPE", () => {
    const now = new Date("2026-05-02T00:10:00+08:00");
    expect(DailyRewards.computeRewardDate(now)).toBe("2026-05-01");
  });
});
