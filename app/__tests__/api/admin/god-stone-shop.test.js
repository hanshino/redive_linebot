const request = require("supertest");
const createApp = require("../../helpers/createApp");

jest.mock("../../../src/controller/princess/GodStoneShop/handler", () => ({
  exchangeItem: jest.fn((req, res) => res.json({ success: true })),
  history: jest.fn((req, res) => res.json([])),
  addGodStoneShopItem: jest.fn((req, res) => res.status(201).json({ id: 1 })),
  destroyGodStoneShopItem: jest.fn((req, res) => res.json({ success: true })),
  updateGodStoneShopItem: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock("../../../src/model/princess/GodStoneShop", () => ({
  all: jest.fn().mockResolvedValue([]),
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("POST /api/admin/god-stone-shop/items", () => {
  it("returns 201 on successful item creation", async () => {
    const res = await request(app)
      .post("/api/admin/god-stone-shop/items")
      .send({ name: "Healing Potion", cost: 100 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1 });
  });
});

describe("DELETE /api/admin/god-stone-shop/items/:id", () => {
  it("returns 200 on successful item deletion", async () => {
    const res = await request(app).delete("/api/admin/god-stone-shop/items/10");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("PUT /api/admin/god-stone-shop/items/:id", () => {
  it("returns 200 on successful item update", async () => {
    const res = await request(app)
      .put("/api/admin/god-stone-shop/items/10")
      .send({ name: "Updated Potion", cost: 200 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
