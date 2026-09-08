// CharacterFragment router 的接線檢查：路徑有掛上、token 的 userId 有轉交、
// 錯誤碼對到正確的 HTTP status、回應欄位是白名單。
// service 一律 mock —— 這裡測的是 HTTP 層的翻譯，不是碎片邏輯本身
// （那個在 service/__tests__/CharacterFragmentService.test.js 打真的 MySQL）。
jest.mock("../../service/CharacterFragmentService", () => ({
  REDEEM_COST: 150,
  getInventory: jest.fn(),
  recycle: jest.fn(),
  redeem: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const routerModule = require("../../router/CharacterFragment");
const CharacterFragmentService = require("../../service/CharacterFragmentService");

// setup.js 的 verifyToken mock 固定塞這個 userId，路由必須把它原封不動往下傳。
const TOKEN_USER = "U" + "a".repeat(32);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", routerModule.router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  CharacterFragmentService.getInventory.mockResolvedValue([]);
});

describe("CharacterFragment 接線", () => {
  it("router 掛上全部 3 條路徑", () => {
    const routes = routerModule.router.stack
      .filter(l => l.route)
      .map(l => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);

    expect(routes).toEqual([
      "GET /character-fragments",
      "POST /character-fragments/:itemId/recycle",
      "POST /character-fragments/:itemId/redeem",
    ]);
  });

  it("GET /character-fragments 用 token 的 userId 查，不看 query", async () => {
    const res = await request(createApp()).get("/api/character-fragments?userId=Uspoofed");

    expect(res.status).toBe(200);
    // 客戶端不能指定要查誰的碎片
    expect(CharacterFragmentService.getInventory).toHaveBeenCalledWith(TOKEN_USER);
  });

  it("GET /character-fragments 回 redeemCost + fragments，前端不用自己寫死 150", async () => {
    CharacterFragmentService.getInventory.mockResolvedValue([
      {
        itemId: 101,
        name: "佩可莉ーヌ",
        headImage: null,
        baseStar: 3,
        amount: 20,
        owned: false,
        canRedeem: false,
      },
    ]);

    const res = await request(createApp()).get("/api/character-fragments");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      redeemCost: 150,
      fragments: [
        {
          itemId: 101,
          name: "佩可莉ーヌ",
          headImage: null,
          baseStar: 3,
          amount: 20,
          owned: false,
          canRedeem: false,
        },
      ],
    });
  });
});

describe("POST /:itemId/recycle", () => {
  it("把 token userId、路由 itemId、body quantity 轉交給 service", async () => {
    CharacterFragmentService.recycle.mockResolvedValue({
      ok: true,
      itemId: 101,
      quantity: 20,
      fragmentBalanceAfter: 30,
      godStoneGained: 20,
    });

    const res = await request(createApp())
      .post("/api/character-fragments/101/recycle")
      .send({ quantity: 20 });

    expect(res.status).toBe(200);
    expect(CharacterFragmentService.recycle).toHaveBeenCalledWith(TOKEN_USER, 101, 20);
  });

  it("成功回應只有白名單欄位，且刻意不含女神石餘額", async () => {
    CharacterFragmentService.recycle.mockResolvedValue({
      ok: true,
      itemId: 101,
      quantity: 20,
      fragmentBalanceAfter: 30,
      godStoneGained: 20,
      // service 內部若多回東西也不該外流
      internalNote: "character_fragment:recycle:101",
    });

    const res = await request(createApp())
      .post("/api/character-fragments/101/recycle")
      .send({ quantity: 20 });

    expect(res.body).toEqual({
      itemId: 101,
      quantity: 20,
      fragmentBalanceAfter: 30,
      godStoneGained: 20,
    });
    expect(res.body).not.toHaveProperty("internalNote");
  });

  it.each(["abc", "0", "-1", "1.5"])(
    "itemId=%s 回 400 INVALID_ITEM 且完全不進 service",
    async raw => {
      const res = await request(createApp())
        .post(`/api/character-fragments/${raw}/recycle`)
        .send({ quantity: 1 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_ITEM");
      expect(CharacterFragmentService.recycle).not.toHaveBeenCalled();
    }
  );

  it("缺 quantity 不會被貼心地當成 1 —— 交給 service 驗證後回 400", async () => {
    // 回收不可逆，寧可讓前端明講數量。Number(undefined) === NaN
    CharacterFragmentService.recycle.mockResolvedValue({
      ok: false,
      code: "INVALID_QUANTITY",
    });

    const res = await request(createApp()).post("/api/character-fragments/101/recycle").send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_QUANTITY");
    expect(CharacterFragmentService.recycle).toHaveBeenCalledWith(TOKEN_USER, 101, NaN);
  });

  it("INSUFFICIENT_FRAGMENTS 回 409 並附 balance / required / shortfall", async () => {
    CharacterFragmentService.recycle.mockResolvedValue({
      ok: false,
      code: "INSUFFICIENT_FRAGMENTS",
      balance: 12,
      required: 20,
      shortfall: 8,
    });

    const res = await request(createApp())
      .post("/api/character-fragments/101/recycle")
      .send({ quantity: 20 });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "INSUFFICIENT_FRAGMENTS",
      balance: 12,
      required: 20,
      shortfall: 8,
    });
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it("service 丟例外時回 500 INTERNAL，不外洩堆疊", async () => {
    CharacterFragmentService.recycle.mockRejectedValue(new Error("ER_LOCK_DEADLOCK: boom"));

    const res = await request(createApp())
      .post("/api/character-fragments/101/recycle")
      .send({ quantity: 20 });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL");
    expect(JSON.stringify(res.body)).not.toContain("ER_LOCK_DEADLOCK");
  });
});

describe("POST /:itemId/redeem", () => {
  it("數量不可由 client 指定：service 只收 userId 與 itemId", async () => {
    CharacterFragmentService.redeem.mockResolvedValue({
      ok: true,
      itemId: 101,
      name: "佩可莉ーヌ",
      headImage: null,
      star: 1,
      cost: 150,
      fragmentBalanceAfter: 0,
    });

    const res = await request(createApp())
      .post("/api/character-fragments/101/redeem")
      .send({ quantity: 99, cost: 1 });

    expect(res.status).toBe(200);
    // 傳了 quantity / cost 也不能影響：兌換一律 150 換 1 隻
    expect(CharacterFragmentService.redeem).toHaveBeenCalledWith(TOKEN_USER, 101);
    expect(CharacterFragmentService.redeem).toHaveBeenCalledTimes(1);
  });

  it("成功回應只有白名單欄位，star 固定由 service 決定", async () => {
    CharacterFragmentService.redeem.mockResolvedValue({
      ok: true,
      itemId: 101,
      name: "佩可莉ーヌ",
      headImage: "https://example.test/101.png",
      star: 1,
      cost: 150,
      fragmentBalanceAfter: 0,
    });

    const res = await request(createApp()).post("/api/character-fragments/101/redeem");

    expect(res.body).toEqual({
      itemId: 101,
      name: "佩可莉ーヌ",
      headImage: "https://example.test/101.png",
      star: 1,
      cost: 150,
      fragmentBalanceAfter: 0,
    });
  });

  it("ITEM_NOT_FOUND 回 404（不是 409）", async () => {
    CharacterFragmentService.redeem.mockResolvedValue({ ok: false, code: "ITEM_NOT_FOUND" });

    const res = await request(createApp()).post("/api/character-fragments/8888/redeem");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ITEM_NOT_FOUND");
  });

  it("INVALID_ITEM 回 400", async () => {
    CharacterFragmentService.redeem.mockResolvedValue({ ok: false, code: "INVALID_ITEM" });

    const res = await request(createApp()).post("/api/character-fragments/999/redeem");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ITEM");
  });

  it("ALREADY_OWNED 回 409，訊息要說明碎片還能回收或上市場", async () => {
    CharacterFragmentService.redeem.mockResolvedValue({ ok: false, code: "ALREADY_OWNED" });

    const res = await request(createApp()).post("/api/character-fragments/101/redeem");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_OWNED");
    // 已持有的人最需要知道「碎片沒有變成廢物」
    expect(res.body.message).toContain("回收");
  });

  it("INSUFFICIENT_FRAGMENTS 回 409 並附差額", async () => {
    CharacterFragmentService.redeem.mockResolvedValue({
      ok: false,
      code: "INSUFFICIENT_FRAGMENTS",
      balance: 100,
      required: 150,
      shortfall: 50,
    });

    const res = await request(createApp()).post("/api/character-fragments/101/redeem");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ balance: 100, required: 150, shortfall: 50 });
  });

  it.each(["abc", "0", "-5"])("itemId=%s 回 400，不進 service", async raw => {
    const res = await request(createApp()).post(`/api/character-fragments/${raw}/redeem`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ITEM");
    expect(CharacterFragmentService.redeem).not.toHaveBeenCalled();
  });

  it("service 丟例外時回 500 INTERNAL", async () => {
    CharacterFragmentService.redeem.mockRejectedValue(new Error("boom"));

    const res = await request(createApp()).post("/api/character-fragments/101/redeem");

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL");
  });
});

describe("錯誤訊息", () => {
  it.each([
    ["INVALID_ITEM", 400],
    ["INVALID_QUANTITY", 400],
    ["INSUFFICIENT_FRAGMENTS", 409],
    ["ALREADY_OWNED", 409],
  ])("%s 一定有非空的中文訊息（status %i）", async (code, status) => {
    CharacterFragmentService.recycle.mockResolvedValue({ ok: false, code });

    const res = await request(createApp())
      .post("/api/character-fragments/101/recycle")
      .send({ quantity: 20 });

    expect(res.status).toBe(status);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
    expect(res.body.message).not.toBe("undefined");
  });

  it("未知錯誤碼退回 409 + 通用訊息，不會出現 undefined", async () => {
    CharacterFragmentService.recycle.mockResolvedValue({ ok: false, code: "SOMETHING_NEW" });

    const res = await request(createApp())
      .post("/api/character-fragments/101/recycle")
      .send({ quantity: 20 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SOMETHING_NEW");
    expect(res.body.message.length).toBeGreaterThan(0);
  });
});
