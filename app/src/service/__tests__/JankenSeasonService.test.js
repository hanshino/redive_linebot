require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");
const JankenSeasonService = require("../JankenSeasonService");

describe("JankenSeasonService.endCurrentAndOpenNext", () => {
  beforeEach(async () => {
    await mysql("janken_season_snapshot").delete();
    await mysql("janken_seasons").delete();
    await mysql("janken_rating").delete();
    await mysql("janken_seasons").insert({
      id: 1,
      started_at: new Date(),
      status: "active",
      notes: "season 1",
    });
    await mysql("janken_rating").insert([
      {
        user_id: "U1",
        elo: 1700,
        rank_tier: "legend",
        win_count: 50,
        lose_count: 10,
        draw_count: 5,
        streak: 3,
        max_streak: 8,
        bounty: 0,
      },
      {
        user_id: "U2",
        elo: 1500,
        rank_tier: "master",
        win_count: 30,
        lose_count: 12,
        draw_count: 4,
        streak: 0,
        max_streak: 6,
        bounty: 0,
      },
      {
        user_id: "U3",
        elo: 1100,
        rank_tier: "challenger",
        win_count: 12,
        lose_count: 8,
        draw_count: 2,
        streak: 1,
        max_streak: 3,
        bounty: 0,
      },
    ]);
  });
  afterAll(() => mysql.destroy());

  test("snapshots top, resets, opens next season", async () => {
    const result = await JankenSeasonService.endCurrentAndOpenNext({
      note: "test reset",
      payoutEnabled: false,
    });
    expect(result.closedSeasonId).toBe(1);
    expect(result.newSeasonId).toBeGreaterThan(1);
    expect(result.snapshotCount).toBe(3);

    const snapshots = await mysql("janken_season_snapshot").where({ season_id: 1 }).orderBy("rank");
    expect(snapshots[0].user_id).toBe("U1");
    expect(snapshots[0].rank).toBe(1);

    const closed = await mysql("janken_seasons").where({ id: 1 }).first();
    expect(closed.status).toBe("closed");
    expect(closed.ended_at).not.toBeNull();

    const newActive = await mysql("janken_seasons").where({ status: "active" }).first();
    expect(newActive.id).toBe(result.newSeasonId);
    expect(newActive.notes).toBe("test reset");

    const u1 = await mysql("janken_rating").where({ user_id: "U1" }).first();
    expect(u1.elo).toBe(1000);
    expect(u1.rank_tier).toBe("beginner");
    expect(u1.win_count).toBe(0);
    expect(u1.lifetime_win_count).toBe(50);
    expect(u1.max_streak).toBe(8);
  });

  test("aborts when no active season", async () => {
    await mysql("janken_seasons").update({ status: "closed", ended_at: new Date() });
    await expect(
      JankenSeasonService.endCurrentAndOpenNext({ note: "x", payoutEnabled: false })
    ).rejects.toThrow(/no active season/i);
  });
});
