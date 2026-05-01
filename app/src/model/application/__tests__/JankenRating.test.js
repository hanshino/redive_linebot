// Unit tests with mocked config — exercises getTiers() via the config-read path.
// Companion integration tests (no mock, against real default.json) live at
// app/__tests__/model/JankenRating.test.js.
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
jest.mock("config", () => ({
  get: jest.fn(key => {
    if (key === "minigame.janken.elo.tiers") {
      return [
        { key: "beginner", name: "見習者", minElo: 0 },
        { key: "challenger", name: "挑戰者", minElo: 1100 },
        { key: "fighter", name: "強者", minElo: 1250 },
        { key: "master", name: "達人", minElo: 1400 },
        { key: "legend", name: "傳說", minElo: 1550 },
      ];
    }
    if (key === "minigame.janken.elo.initial") return 1000;
    return undefined;
  }),
}));

const JankenRating = require("../JankenRating");

describe("JankenRating tiers from config", () => {
  test("returns fighter at 1250", () => {
    expect(JankenRating.getRankTier(1250)).toBe("fighter");
  });
  test("returns master at 1400", () => {
    expect(JankenRating.getRankTier(1400)).toBe("master");
  });
  test("returns challenger at 1100", () => {
    expect(JankenRating.getRankTier(1100)).toBe("challenger");
  });
  test("returns beginner at 1099", () => {
    expect(JankenRating.getRankTier(1099)).toBe("beginner");
  });
  test("getNextTierElo from challenger returns fighter floor", () => {
    expect(JankenRating.getNextTierElo(1150)).toBe(1250);
  });
});

describe("JankenRating.getTopByElo", () => {
  beforeEach(async () => {
    await mysql("janken_rating").delete();
    await mysql("janken_rating").insert([
      { user_id: "U_A", elo: 1500, rank_tier: "master", win_count: 10 },
      { user_id: "U_B", elo: 1100, rank_tier: "challenger", win_count: 5 },
      { user_id: "U_C", elo: 1700, rank_tier: "legend", win_count: 20 },
    ]);
  });

  test("returns rows ordered by elo desc", async () => {
    const rows = await JankenRating.getTopByElo(2);
    expect(rows[0].user_id).toBe("U_C");
    expect(rows[1].user_id).toBe("U_A");
  });
});

describe("JankenRating.resetSeasonFields", () => {
  beforeEach(async () => {
    await mysql("janken_rating").delete();
    await mysql("janken_rating").insert([
      {
        user_id: "U_X",
        elo: 1500,
        rank_tier: "master",
        win_count: 30,
        lose_count: 10,
        draw_count: 5,
        streak: 4,
        max_streak: 9,
        bounty: 100,
        lifetime_win_count: 0,
        lifetime_lose_count: 0,
        lifetime_draw_count: 0,
      },
    ]);
  });
  afterAll(() => mysql.destroy());

  test("rotates per-season fields into lifetime, zeros bounty/streak, leaves max_streak", async () => {
    await JankenRating.resetSeasonFields();
    const row = await mysql("janken_rating").where({ user_id: "U_X" }).first();
    expect(row.elo).toBe(1000);
    expect(row.rank_tier).toBe("beginner");
    expect(row.win_count).toBe(0);
    expect(row.lose_count).toBe(0);
    expect(row.draw_count).toBe(0);
    expect(row.streak).toBe(0);
    expect(row.bounty).toBe(0);
    expect(row.max_streak).toBe(9);
    expect(row.lifetime_win_count).toBe(30);
    expect(row.lifetime_lose_count).toBe(10);
    expect(row.lifetime_draw_count).toBe(5);
  });
});
