const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/handler/Inventory", () => ({
  all: jest.fn((req, res) => res.json({ items: [] })),
  getPool: jest.fn((req, res) => res.json({ pool: [] })),
  totalGodStone: jest.fn((req, res) => res.json({ total: 0 })),
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/inventory", () => {
  it("returns 200 with inventory items", async () => {
    const res = await request(app)
      .get("/api/inventory")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });
});

describe("GET /api/inventory/pool", () => {
  it("returns 200 with pool data", async () => {
    const res = await request(app).get("/api/inventory/pool");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pool: [] });
  });
});

describe("GET /api/inventory/total-god-stone", () => {
  it("returns 200 with total god stone count", async () => {
    const res = await request(app)
      .get("/api/inventory/total-god-stone")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0 });
  });
});
