const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/service/SigninService", () => ({
  getCalendar: jest.fn(),
  makeup: jest.fn(),
}));

const SigninService = require("../../src/service/SigninService");

const USER_ID = "U" + "a".repeat(32);

const PAYLOAD = {
  month: "2026-08",
  today: "2026-08-07",
  daysInMonth: 31,
  makeupCost: 20000,
  godStoneBalance: 51000,
  entries: [{ date: "2026-08-06", source: "normal", costStones: 0 }],
  stats: { streak: 1, total: 12, monthCount: 1, fullMonth: false },
};

let app;
beforeAll(() => {
  app = createApp();
});
beforeEach(() => jest.clearAllMocks());

describe("GET /api/me/signins", () => {
  it("returns the calendar payload for the token's own userId", async () => {
    SigninService.getCalendar.mockResolvedValue(PAYLOAD);

    const res = await request(app).get("/api/me/signins").set("Authorization", "Bearer t");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(PAYLOAD);
    expect(SigninService.getCalendar).toHaveBeenCalledWith(USER_ID);
  });

  it("carries every documented top-level key", async () => {
    SigninService.getCalendar.mockResolvedValue(PAYLOAD);

    const res = await request(app).get("/api/me/signins").set("Authorization", "Bearer t");

    expect(Object.keys(res.body).sort()).toEqual(
      ["month", "today", "daysInMonth", "makeupCost", "godStoneBalance", "entries", "stats"].sort()
    );
  });

  it("500s on an unexpected service failure", async () => {
    SigninService.getCalendar.mockRejectedValue(new Error("db down"));

    const res = await request(app).get("/api/me/signins").set("Authorization", "Bearer t");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal_error" });
  });
});

describe("POST /api/me/signins/makeup", () => {
  it("returns the refreshed payload plus ok/created on success", async () => {
    SigninService.makeup.mockResolvedValue({
      ok: true,
      date: "2026-08-05",
      cost: 20000,
      unlocked: [],
    });
    SigninService.getCalendar.mockResolvedValue(PAYLOAD);

    const res = await request(app)
      .post("/api/me/signins/makeup")
      .set("Authorization", "Bearer t")
      .send({ date: "2026-08-05" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ...PAYLOAD,
      ok: true,
      created: { date: "2026-08-05", cost: 20000 },
    });
    expect(SigninService.makeup).toHaveBeenCalledWith(USER_ID, "2026-08-05");
  });

  it("surfaces newly unlocked achievements on the success response", async () => {
    const rows = [
      {
        id: 900,
        key: "secret",
        name: "全勤達人",
        icon: "🗓",
        rarity: 3,
        reward_stones: 500,
        category_key: "signin",
      },
    ];
    SigninService.makeup.mockResolvedValue({
      ok: true,
      date: "2026-08-05",
      cost: 20000,
      unlocked: rows,
    });
    SigninService.getCalendar.mockResolvedValue(PAYLOAD);

    const res = await request(app)
      .post("/api/me/signins/makeup")
      .set("Authorization", "Bearer t")
      .send({ date: "2026-08-05" });

    expect(res.status).toBe(200);
    expect(res.body.unlocked).toEqual(rows);
    // 既有欄位仍在，前端舊版不會壞
    expect(res.body.entries).toEqual(PAYLOAD.entries);
    expect(res.body.stats).toEqual(PAYLOAD.stats);
    expect(res.body.created).toEqual({ date: "2026-08-05", cost: 20000 });
  });

  it("does not leak achievement internals even if the service hands back a full row", async () => {
    // 縱深防禦：service 已投影，但 controller 不該把任何私密欄位轉出去。
    SigninService.makeup.mockResolvedValue({
      ok: true,
      date: "2026-08-05",
      cost: 20000,
      unlocked: [{ id: 900, key: "secret", name: "全勤達人", icon: "🗓" }],
    });
    SigninService.getCalendar.mockResolvedValue(PAYLOAD);

    const res = await request(app)
      .post("/api/me/signins/makeup")
      .set("Authorization", "Bearer t")
      .send({ date: "2026-08-05" });

    expect(res.text).not.toContain("condition");
    expect(res.text).not.toContain("notify_message");
  });

  it("always sends an unlocked array even when the service omits it", async () => {
    SigninService.makeup.mockResolvedValue({ ok: true, date: "2026-08-05", cost: 20000 });
    SigninService.getCalendar.mockResolvedValue(PAYLOAD);

    const res = await request(app)
      .post("/api/me/signins/makeup")
      .set("Authorization", "Bearer t")
      .send({ date: "2026-08-05" });

    expect(res.body.unlocked).toEqual([]);
  });

  it("never trusts a userId supplied in the body", async () => {
    SigninService.makeup.mockResolvedValue({ ok: true, date: "2026-08-05", cost: 20000 });
    SigninService.getCalendar.mockResolvedValue(PAYLOAD);

    await request(app)
      .post("/api/me/signins/makeup")
      .set("Authorization", "Bearer t")
      .send({ date: "2026-08-05", userId: "Uvictim", user_id: "Uvictim" });

    expect(SigninService.makeup).toHaveBeenCalledWith(USER_ID, "2026-08-05");
  });

  it.each([
    ["INVALID_DATE", 400],
    ["NOT_CURRENT_MONTH", 400],
    ["DATE_NOT_PAST", 400],
    ["INSUFFICIENT_STONES", 400],
    ["ALREADY_SIGNED", 409],
  ])("maps %s to HTTP %i with the code in the body", async (code, status) => {
    SigninService.makeup.mockResolvedValue({ ok: false, code });

    const res = await request(app)
      .post("/api/me/signins/makeup")
      .set("Authorization", "Bearer t")
      .send({ date: "2026-08-05" });

    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(typeof res.body.message).toBe("string");
    // 失敗時不得回傳月曆 payload（前端才不會誤以為補簽成功）
    expect(res.body.entries).toBeUndefined();
    expect(res.body.unlocked).toBeUndefined();
    expect(SigninService.getCalendar).not.toHaveBeenCalled();
  });

  it("400s with the code when the body has no date at all", async () => {
    SigninService.makeup.mockResolvedValue({ ok: false, code: "INVALID_DATE" });

    const res = await request(app)
      .post("/api/me/signins/makeup")
      .set("Authorization", "Bearer t")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_DATE");
    expect(SigninService.makeup).toHaveBeenCalledWith(USER_ID, undefined);
  });

  it("500s on an unexpected service failure", async () => {
    SigninService.makeup.mockRejectedValue(new Error("boom"));

    const res = await request(app)
      .post("/api/me/signins/makeup")
      .set("Authorization", "Bearer t")
      .send({ date: "2026-08-05" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal_error" });
  });
});
