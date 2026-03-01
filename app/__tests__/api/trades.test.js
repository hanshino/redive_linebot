const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/handler/Trade", () => ({
  create: jest.fn((req, res) => res.status(201).json({ success: true })),
  all: jest.fn((req, res) => res.json({ trades: [] })),
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/trades", () => {
  it("returns 200 with trades list", async () => {
    const res = await request(app)
      .get("/api/trades")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trades: [] });
  });
});

describe("POST /api/trades", () => {
  it("returns 201 with success response", async () => {
    const res = await request(app)
      .post("/api/trades")
      .set("Authorization", "Bearer test-token")
      .send({ itemId: 1, targetId: "Ubbbb", charge: 100 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true });
  });
});
