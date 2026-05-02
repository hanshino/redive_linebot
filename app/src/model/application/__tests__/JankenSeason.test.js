require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const JankenSeason = require("../JankenSeason");

describe("JankenSeason", () => {
  beforeEach(async () => {
    await mysql("janken_seasons").delete();
  });
  afterAll(() => mysql.destroy());

  test("getActive returns the row with status='active'", async () => {
    await mysql("janken_seasons").insert([
      { id: 1, started_at: new Date(), status: "closed", ended_at: new Date() },
      { id: 2, started_at: new Date(), status: "active" },
    ]);
    const active = await JankenSeason.getActive();
    expect(active.id).toBe(2);
  });

  test("close sets status=closed and ended_at", async () => {
    await mysql("janken_seasons").insert({ id: 3, started_at: new Date(), status: "active" });
    await JankenSeason.close(3);
    const row = await mysql("janken_seasons").where({ id: 3 }).first();
    expect(row.status).toBe("closed");
    expect(row.ended_at).not.toBeNull();
  });

  test("openNew creates a new active season", async () => {
    const id = await JankenSeason.openNew("test note");
    const row = await mysql("janken_seasons").where({ id }).first();
    expect(row.status).toBe("active");
    expect(row.notes).toBe("test note");
  });
});
