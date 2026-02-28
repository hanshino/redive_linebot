const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/controller/application/Statistics", () => ({
  showStatistics: jest.fn((req, res) => res.json({ totalUsers: 100 })),
  showUserStatistics: jest.fn((req, res) =>
    res.json({ userId: req.profile.userId, gachaCount: 50 })
  ),
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/statistics", () => {
  it("returns 200 with statistics data", async () => {
    const res = await request(app).get("/api/statistics");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalUsers: 100 });
  });
});

describe("GET /api/users/me/statistics", () => {
  it("returns 200 with user statistics data", async () => {
    const res = await request(app)
      .get("/api/users/me/statistics")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: "U" + "a".repeat(32),
      gachaCount: 50,
    });
  });
});
