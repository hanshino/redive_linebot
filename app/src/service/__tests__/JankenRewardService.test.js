require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");
const JankenRewardService = require("../JankenRewardService");

describe("JankenRewardService.payoutDaily", () => {
  beforeEach(async () => {
    await Promise.all([
      mysql("janken_daily_reward_log").delete(),
      mysql("janken_records").delete(),
      mysql("janken_rating").delete(),
      mysql("Inventory").where({ note: "janken_daily_rank_reward" }).delete(),
      mysql("janken_seasons").delete(),
    ]);
    await mysql("janken_seasons").insert({ id: 1, started_at: new Date(), status: "active" });
  });
  afterAll(() => mysql.destroy());
  afterEach(() => {
    jest.dontMock("config");
    jest.resetModules();
  });

  test("dry-run when flag is false: no inventory, no log rows", async () => {
    await mysql("janken_rating").insert({ user_id: "U_T", elo: 1100, rank_tier: "challenger" });
    await mysql("janken_records").insert({
      id: "rec-1",
      user_id: "U_T",
      target_user_id: "U_O",
      group_id: "G",
      bet_amount: 100,
      created_at: yesterdayLocal(),
    });
    const result = await JankenRewardService.payoutDaily(yesterdayDateString());
    expect(result.dryRun).toBe(true);
    expect(result.candidates).toHaveLength(1);
    const stones = await mysql("Inventory").where({ note: "janken_daily_rank_reward" });
    expect(stones).toHaveLength(0);
    const logs = await mysql("janken_daily_reward_log");
    expect(logs).toHaveLength(0);
  });

  test("flag-on: inserts log row + credits inventory", async () => {
    jest.resetModules();
    jest.doMock("config", () => {
      const orig = jest.requireActual("config");
      return {
        get: jest.fn(key => {
          if (key === "minigame.janken.daily_reward.enableDailyRankReward") return true;
          return orig.get(key);
        }),
      };
    });
    const Service = require("../JankenRewardService");
    const date = yesterdayDateString();
    await mysql("janken_rating").insert({ user_id: "U_FlagOn", elo: 1700, rank_tier: "legend" });
    await mysql("janken_records").insert({
      id: "rec-flag",
      user_id: "U_FlagOn",
      target_user_id: "U_O",
      group_id: "G",
      bet_amount: 500,
      created_at: yesterdayLocal(),
    });
    const result = await Service.payoutDaily(date);
    expect(result.dryRun).toBe(false);
    const log = await mysql("janken_daily_reward_log").where({ user_id: "U_FlagOn" }).first();
    expect(log.amount).toBe(500); // top1
    const stones = await mysql("Inventory")
      .where({ note: "janken_daily_rank_reward", userId: "U_FlagOn" })
      .first();
    expect(Number(stones.itemAmount)).toBe(500);
  });
  test("dry-run with no active players returns empty candidates", async () => {
    // No janken_records inserted. Should return empty candidates with the active season id.
    const result = await JankenRewardService.payoutDaily(yesterdayDateString());
    expect(result.candidates).toEqual([]);
    expect(result.season).toBe(1);
  });

  test("dry-run with no active season returns season:null", async () => {
    await mysql("janken_seasons").update({ status: "closed", ended_at: new Date() });
    const result = await JankenRewardService.payoutDaily(yesterdayDateString());
    expect(result.season).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});

function yesterdayLocal() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d;
}
function yesterdayDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
