const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/model/princess/GodStoneShop", () => ({
  all: jest.fn().mockResolvedValue([{ id: 1, name: "Test Item" }]),
  find: jest.fn(),
  findByItemId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  deleteByItemId: jest.fn(),
}));

jest.mock("../../src/controller/princess/GodStoneShop/handler", () => ({
  exchangeItem: jest.fn((req, res) => res.json({ success: true })),
  history: jest.fn((req, res) => res.json({ history: [] })),
  addGodStoneShopItem: jest.fn((req, res) => res.status(201).json({ id: 1 })),
  destroyGodStoneShopItem: jest.fn((req, res) => res.json({ success: true })),
  updateGodStoneShopItem: jest.fn((req, res) => res.json({ success: true })),
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/god-stone-shop", () => {
  it("returns 200 with shop item list", async () => {
    const res = await request(app).get("/api/god-stone-shop");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: "Test Item" }]);
  });
});

describe("POST /api/god-stone-shop/purchase", () => {
  it("returns 200 with success response", async () => {
    const res = await request(app)
      .post("/api/god-stone-shop/purchase")
      .set("Authorization", "Bearer test-token")
      .send({ itemId: 1, itemCount: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("GET /api/god-stone-shop/history", () => {
  it("returns 200 with history data", async () => {
    const res = await request(app)
      .get("/api/god-stone-shop/history")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ history: [] });
  });
});
