// 一次性接線檢查：router 有掛上預期路徑、template 產出的動態欄位正確。
jest.mock("../../service/PublicMarketService", () => {
  const actual = jest.requireActual("../../service/PublicMarketService");
  return { ...actual, purchase: jest.fn() };
});

const request = require("supertest");
const express = require("express");
const routerModule = require("../../router/PublicMarket");
const PublicMarketService = require("../../service/PublicMarketService");
const { generateMarketBubble } = require("../../templates/application/PublicMarket");

describe("PublicMarket 接線", () => {
  it("router 掛上全部 8 條路徑", () => {
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

  it("footer 兩顆按鈕都是 LIFF 連結，沒有殘留 PLACEHOLDER", () => {
    const bubble = generateMarketBubble({
      myOpenCount: 3,
      maxOpen: 10,
      totalOpenCount: 128,
      feePercent: 5,
    });
    const uris = bubble.footer.contents.map(b => b.action.uri);

    expect(uris).toHaveLength(2);
    uris.forEach(uri => {
      expect(uri).toContain("https://liff.line.me/");
      expect(uri).not.toContain("PLACEHOLDER");
    });
    expect(uris[0]).toContain("/trade/market");
    expect(uris[1]).toContain("/trade/sell");
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
    expect(bubble.body.contents[3].contents[1].text).toBe("128 筆");
  });
});

describe("購買回應欄位白名單", () => {
  function createApp() {
    const app = express();
    app.use(express.json());
    app.use("/api", routerModule.router);
    return app;
  }

  it("service 回傳的 sellerId 不會外洩到 HTTP 回應", async () => {
    // service 內部帶 sellerId 只為了 commit 後結算成就，不該讓買家看到賣家的 LINE userId
    PublicMarketService.purchase.mockResolvedValue({
      ok: true,
      listingId: 42,
      itemId: 101,
      name: "佩可莉ーヌ",
      sellerId: "U" + "1".repeat(32),
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
});
