const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/handler/Market", () => ({
  show: jest.fn((req, res) => res.json({ id: req.params.id })),
  transaction: jest.fn((req, res) => res.status(201).json({ success: true })),
  cancel: jest.fn((req, res) => res.json({ success: true })),
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/market/:id", () => {
  it("returns 200 with market item details", async () => {
    const res = await request(app)
      .get("/api/market/42")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "42" });
  });
});

describe("POST /api/market/:id/transactions", () => {
  it("returns 201 with success response", async () => {
    const res = await request(app)
      .post("/api/market/42/transactions")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true });
  });
});

describe("DELETE /api/market/:id/transactions", () => {
  it("returns 200 with success response", async () => {
    const res = await request(app)
      .delete("/api/market/42/transactions")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
