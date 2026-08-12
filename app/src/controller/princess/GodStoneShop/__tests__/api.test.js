// api.js 的接線測試：async handler 的 rejection 必須交給 Express，
// 不能變成 unhandled rejection（請求永遠掛著，且 Node 預設會讓 bot 行程結束）。

jest.mock("../../../../model/princess/GodStoneShop", () => ({
  all: jest.fn(),
  findByItemId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}));

jest.mock("../handler", () => ({
  exchangeItem: jest.fn(),
  history: jest.fn(),
  addGodStoneShopItem: jest.fn(),
  destroyGodStoneShopItem: jest.fn(),
  updateGodStoneShopItem: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const router = require("../api");
const GodStoneShopModel = require("../../../../model/princess/GodStoneShop");
const handler = require("../handler");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
}

/** 讓未捕捉的 rejection 直接讓測試失敗，而不是安靜地污染後續測試。 */
let unhandled;
beforeAll(() => {
  unhandled = jest.fn();
  process.on("unhandledRejection", unhandled);
});
afterAll(() => {
  process.off("unhandledRejection", unhandled);
});

beforeEach(() => {
  jest.clearAllMocks();
  GodStoneShopModel.all.mockResolvedValue([{ itemId: 101, price: 3000 }]);
  handler.exchangeItem.mockImplementation((req, res) => res.json({ ok: true }));
  handler.history.mockImplementation((req, res) => res.json({ history: [] }));
  handler.addGodStoneShopItem.mockImplementation((req, res) => res.status(201).json({ id: 1 }));
  handler.destroyGodStoneShopItem.mockImplementation((req, res) => res.json({}));
  handler.updateGodStoneShopItem.mockImplementation((req, res) => res.json({}));
});

describe("正常路徑仍照舊", () => {
  it("GET /god-stone-shop 回商品列表", async () => {
    const res = await request(createApp()).get("/api/god-stone-shop");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ itemId: 101, price: 3000 }]);
  });

  it("POST /god-stone-shop/purchase 走 exchangeItem", async () => {
    const res = await request(createApp())
      .post("/api/god-stone-shop/purchase")
      .send({ itemId: 101, itemCount: 1 });

    expect(res.status).toBe(200);
    expect(handler.exchangeItem).toHaveBeenCalled();
  });

  it("GET /god-stone-shop/history 走 history", async () => {
    const res = await request(createApp()).get("/api/god-stone-shop/history");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ history: [] });
  });

  it.each([
    ["post", "/api/admin/god-stone-shop/items", 201],
    ["delete", "/api/admin/god-stone-shop/items/10", 200],
    ["put", "/api/admin/god-stone-shop/items/10", 200],
  ])("%s %s 仍可用", async (method, path, expected) => {
    const res = await request(createApp())[method](path).send({});

    expect(res.status).toBe(expected);
  });
});

describe("async rejection 交給 Express，不變成 unhandled rejection", () => {
  it("GET /god-stone-shop 的 model 爆炸時回 500 而不是掛住", async () => {
    GodStoneShopModel.all.mockRejectedValue(new Error("db down"));

    const res = await request(createApp()).get("/api/god-stone-shop");

    expect(res.status).toBe(500);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it.each([
    ["exchangeItem", "post", "/api/god-stone-shop/purchase"],
    ["history", "get", "/api/god-stone-shop/history"],
    ["addGodStoneShopItem", "post", "/api/admin/god-stone-shop/items"],
    ["destroyGodStoneShopItem", "delete", "/api/admin/god-stone-shop/items/10"],
    ["updateGodStoneShopItem", "put", "/api/admin/god-stone-shop/items/10"],
  ])("%s reject 時回 500", async (name, method, path) => {
    handler[name].mockRejectedValue(new Error("boom"));

    const res = await request(createApp())[method](path).send({});

    expect(res.status).toBe(500);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("handler 同步 throw 也一樣走到 500（Express 本來就接得住，確認沒被包壞）", async () => {
    handler.exchangeItem.mockImplementation(() => {
      throw new Error("sync boom");
    });

    const res = await request(createApp()).post("/api/god-stone-shop/purchase").send({});

    expect(res.status).toBe(500);
  });
});
