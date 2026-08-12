// 一次性接線檢查：router 有掛上預期路徑、回應欄位白名單、template 產出的動態欄位正確。
jest.mock("../../service/PublicMarketService", () => {
  const actual = jest.requireActual("../../service/PublicMarketService");
  return {
    ...actual,
    purchase: jest.fn(),
    fulfill: jest.fn(),
    createListing: jest.fn(),
    cancelListing: jest.fn(),
    getOpenCharacters: jest.fn(),
    getListingsByItemId: jest.fn(),
  };
});

const request = require("supertest");
const express = require("express");
const routerModule = require("../../router/PublicMarket");
const PublicMarketService = require("../../service/PublicMarketService");
const { generateMarketBubble } = require("../../templates/application/PublicMarket");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", routerModule.router);
  return app;
}

const SELLER = "U" + "1".repeat(32);
const BUYER = "U" + "2".repeat(32);

beforeEach(() => {
  jest.clearAllMocks();
  PublicMarketService.getOpenCharacters.mockResolvedValue([]);
  PublicMarketService.getListingsByItemId.mockResolvedValue([]);
});

describe("PublicMarket 接線", () => {
  it("router 掛上全部 9 條路徑", () => {
    const routes = routerModule.router.stack
      .filter(l => l.route)
      .map(l => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);

    expect(routes).toEqual([
      "GET /public-market/summary",
      "GET /public-market/characters",
      "GET /public-market/listings",
      "GET /public-market/my-listings",
      "GET /public-market/listings/:id",
      "POST /public-market/listings",
      "DELETE /public-market/listings/:id",
      "POST /public-market/listings/:id/purchase",
      "POST /public-market/listings/:id/fulfill",
    ]);
  });

  it("/my-listings 排在 /listings/:id 之前，才不會被當成 id", () => {
    const paths = routerModule.router.stack.filter(l => l.route).map(l => l.route.path);
    expect(paths.indexOf("/public-market/my-listings")).toBeLessThan(
      paths.indexOf("/public-market/listings/:id")
    );
  });

  it.each([
    [0, "0%"],
    [3, "30%"],
    [10, "100%"],
    [12, "100%"],
  ])("myOpenCount %i -> 配額條寬 %s", (myOpenCount, expected) => {
    const bubble = generateMarketBubble({
      myOpenCount,
      maxOpen: 10,
      totalOpenCount: 128,
      feePercent: 5,
    });
    expect(bubble.body.contents[1].contents[0].width).toBe(expected);
  });

  it("footer 三顆按鈕都是 LIFF 連結，含發布收購單入口", () => {
    const bubble = generateMarketBubble({
      myOpenCount: 3,
      maxOpen: 10,
      totalOpenCount: 128,
      feePercent: 5,
    });
    const uris = bubble.footer.contents.map(b => b.action.uri);

    expect(uris).toHaveLength(3);
    uris.forEach(uri => {
      expect(uri).toContain("https://liff.line.me/");
      expect(uri).not.toContain("PLACEHOLDER");
    });
    expect(uris[0]).toContain("/trade/market");
    expect(uris[1]).toContain("/trade/sell");
    expect(uris[2]).toContain("/trade/buy");
  });

  it("配額文案講明是買賣合計，玩家才不會以為兩種各 10 筆", () => {
    const bubble = generateMarketBubble({
      myOpenCount: 3,
      maxOpen: 10,
      totalOpenCount: 128,
      feePercent: 5,
    });

    expect(bubble.body.contents[0].contents[0].text).toBe("我的開放委託");
    expect(bubble.body.contents[2].text).toBe("賣單 + 收購單合計");
  });

  it("header 漸層與文案與設計稿一致", () => {
    const bubble = generateMarketBubble({
      myOpenCount: 3,
      maxOpen: 10,
      totalOpenCount: 128,
      feePercent: 5,
    });

    expect(bubble.header.background).toMatchObject({
      type: "linearGradient",
      angle: "135deg",
      startColor: "#00838F",
      endColor: "#00ACC1",
    });
    expect(bubble.header.contents[0].contents[0].text).toBe("公開市場");
    expect(bubble.header.contents[0].contents[1].text).toBe("手續費 5%");
    expect(bubble.body.contents[0].contents[1].text).toBe("3 / 10");
    expect(bubble.body.contents[4].contents[1].text).toBe("128 筆");
  });
});

describe("讀取端 orderType", () => {
  it("GET /characters 缺省查賣單簿", async () => {
    await request(createApp()).get("/api/public-market/characters");

    expect(PublicMarketService.getOpenCharacters).toHaveBeenCalledWith("sell");
  });

  it("GET /characters?orderType=buy 查收購簿", async () => {
    await request(createApp()).get("/api/public-market/characters?orderType=buy");

    expect(PublicMarketService.getOpenCharacters).toHaveBeenCalledWith("buy");
  });

  it("GET /characters?orderType=亂寫 安靜退回賣單簿，不讓整頁掛掉", async () => {
    const res = await request(createApp()).get("/api/public-market/characters?orderType=nonsense");

    expect(res.status).toBe(200);
    expect(PublicMarketService.getOpenCharacters).toHaveBeenCalledWith("sell");
  });

  it("GET /listings 缺省查賣單，帶 buy 查收購單", async () => {
    const app = createApp();

    await request(app).get("/api/public-market/listings?itemId=101");
    expect(PublicMarketService.getListingsByItemId).toHaveBeenLastCalledWith(
      101,
      expect.any(String),
      "sell"
    );

    await request(app).get("/api/public-market/listings?itemId=101&orderType=buy");
    expect(PublicMarketService.getListingsByItemId).toHaveBeenLastCalledWith(
      101,
      expect.any(String),
      "buy"
    );
  });

  it("GET /listings 缺 itemId 回 400 INVALID_ITEM", async () => {
    const res = await request(createApp()).get("/api/public-market/listings");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ITEM");
    expect(PublicMarketService.getListingsByItemId).not.toHaveBeenCalled();
  });
});

describe("POST /listings 方向分派", () => {
  it("缺省 orderType 走賣單", async () => {
    PublicMarketService.createListing.mockResolvedValue({ ok: true, listing: { id: 1 } });

    const res = await request(createApp())
      .post("/api/public-market/listings")
      .send({ itemId: 101, price: 1000 });

    expect(res.status).toBe(201);
    expect(PublicMarketService.createListing).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ itemId: 101, price: 1000, orderType: "sell" })
    );
  });

  it("orderType=buy 帶到 service", async () => {
    PublicMarketService.createListing.mockResolvedValue({
      ok: true,
      listing: { id: 2, orderType: "buy" },
    });

    const res = await request(createApp())
      .post("/api/public-market/listings")
      .send({ itemId: 101, price: 1000, orderType: "buy" });

    expect(res.status).toBe(201);
    expect(PublicMarketService.createListing).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ orderType: "buy" })
    );
  });

  it("方向拼錯回 400 INVALID_ORDER_TYPE，完全不進 service", async () => {
    const res = await request(createApp())
      .post("/api/public-market/listings")
      .send({ itemId: 101, price: 1000, orderType: "sel" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ORDER_TYPE");
    expect(PublicMarketService.createListing).not.toHaveBeenCalled();
  });

  it("NOT_ENOUGH_TO_RESERVE 回 409 並附差額，前端才寫得出還差多少", async () => {
    PublicMarketService.createListing.mockResolvedValue({
      ok: false,
      code: "NOT_ENOUGH_TO_RESERVE",
      balance: 300,
      price: 1000,
      shortfall: 700,
    });

    const res = await request(createApp())
      .post("/api/public-market/listings")
      .send({ itemId: 101, price: 1000, orderType: "buy" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "NOT_ENOUGH_TO_RESERVE",
      balance: 300,
      price: 1000,
      shortfall: 700,
    });
  });

  it.each(["ALREADY_REQUESTED", "ALREADY_OWNED", "ALREADY_LISTED"])(
    "%s 回 409 且訊息不是 undefined",
    async code => {
      PublicMarketService.createListing.mockResolvedValue({ ok: false, code });

      const res = await request(createApp())
        .post("/api/public-market/listings")
        .send({ itemId: 101, price: 1000, orderType: "buy" });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe(code);
      expect(typeof res.body.message).toBe("string");
      expect(res.body.message.length).toBeGreaterThan(0);
    }
  );

  it("LISTING_CAP 帶出配額數字", async () => {
    PublicMarketService.createListing.mockResolvedValue({
      ok: false,
      code: "LISTING_CAP",
      myOpenCount: 10,
      maxOpen: 10,
    });

    const res = await request(createApp())
      .post("/api/public-market/listings")
      .send({ itemId: 101, price: 1000, orderType: "buy" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "LISTING_CAP", myOpenCount: 10, maxOpen: 10 });
    expect(res.body.message).toContain("合計");
  });
});

describe("DELETE /listings/:id", () => {
  it("賣單取消不帶 refundedAmount", async () => {
    PublicMarketService.cancelListing.mockResolvedValue({ ok: true, listingId: 42 });

    const res = await request(createApp()).delete("/api/public-market/listings/42");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ listingId: 42, status: "cancelled" });
  });

  it("收購單取消回 refundedAmount", async () => {
    PublicMarketService.cancelListing.mockResolvedValue({
      ok: true,
      listingId: 42,
      refundedAmount: 8600,
    });

    const res = await request(createApp()).delete("/api/public-market/listings/42");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ listingId: 42, status: "cancelled", refundedAmount: 8600 });
  });

  it("非發布者回 403，文案是發布者語意（賣單收購單共用這個碼）", async () => {
    PublicMarketService.cancelListing.mockResolvedValue({ ok: false, code: "FORBIDDEN" });

    const res = await request(createApp()).delete("/api/public-market/listings/42");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(res.body.message).toBe("你不是這筆委託的發布者");
  });
});

describe("購買 / 履約回應欄位白名單", () => {
  it("purchase：service 回傳的 sellerId 不會外洩到 HTTP 回應", async () => {
    // service 內部帶 sellerId 只為了 commit 後結算成就，不該讓買家看到賣家的 LINE userId
    PublicMarketService.purchase.mockResolvedValue({
      ok: true,
      listingId: 42,
      itemId: 101,
      name: "佩可莉ーヌ",
      sellerId: SELLER,
      price: 1000,
      fee: 50,
      netProceeds: 950,
      balanceAfter: 4000,
    });

    const res = await request(createApp()).post("/api/public-market/listings/42/purchase");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      listingId: 42,
      itemId: 101,
      name: "佩可莉ーヌ",
      price: 1000,
      fee: 50,
      netProceeds: 950,
      balanceAfter: 4000,
    });
    expect(res.body).not.toHaveProperty("sellerId");
  });

  it("fulfill：service 回傳的 buyerId 不會外洩", async () => {
    PublicMarketService.fulfill.mockResolvedValue({
      ok: true,
      listingId: 55,
      itemId: 101,
      name: "佩可莉ーヌ",
      buyerId: BUYER,
      price: 8600,
      fee: 430,
      netProceeds: 8170,
    });

    const res = await request(createApp()).post("/api/public-market/listings/55/fulfill");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      listingId: 55,
      itemId: 101,
      name: "佩可莉ーヌ",
      price: 8600,
      fee: 430,
      netProceeds: 8170,
    });
    expect(res.body).not.toHaveProperty("buyerId");
    expect(res.body).not.toHaveProperty("sellerId");
  });

  it("fulfill 的 ALREADY_OWNED_REQUESTER 回 409 + refundedAmount，前端靠這個碼降級畫面", async () => {
    PublicMarketService.fulfill.mockResolvedValue({
      ok: false,
      code: "ALREADY_OWNED_REQUESTER",
      refundedAmount: 8600,
    });

    const res = await request(createApp()).post("/api/public-market/listings/55/fulfill");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "ALREADY_OWNED_REQUESTER",
      refundedAmount: 8600,
    });
  });

  it("fulfill 的 NOT_OWNED 回 409，且不帶任何退款欄位（單子還開著）", async () => {
    PublicMarketService.fulfill.mockResolvedValue({ ok: false, code: "NOT_OWNED" });

    const res = await request(createApp()).post("/api/public-market/listings/55/fulfill");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_OWNED");
    expect(res.body).not.toHaveProperty("refundedAmount");
  });

  it("fulfill 自己的收購單回 403 IS_BUYER", async () => {
    PublicMarketService.fulfill.mockResolvedValue({ ok: false, code: "IS_BUYER" });

    const res = await request(createApp()).post("/api/public-market/listings/55/fulfill");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("IS_BUYER");
  });

  it.each([
    ["purchase", "purchase"],
    ["fulfill", "fulfill"],
  ])("%s 的 WRONG_ORDER_TYPE 回 409 且有可讀訊息", async (path, method) => {
    PublicMarketService[method].mockResolvedValue({ ok: false, code: "WRONG_ORDER_TYPE" });

    const res = await request(createApp()).post(`/api/public-market/listings/55/${path}`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("WRONG_ORDER_TYPE");
    expect(res.body.message).not.toBe(undefined);
  });

  it.each(["purchase", "fulfill"])("%s 的 id 不合法回 404，不進 service", async path => {
    const res = await request(createApp()).post(`/api/public-market/listings/abc/${path}`);

    expect(res.status).toBe(404);
    expect(PublicMarketService.purchase).not.toHaveBeenCalled();
    expect(PublicMarketService.fulfill).not.toHaveBeenCalled();
  });
});
