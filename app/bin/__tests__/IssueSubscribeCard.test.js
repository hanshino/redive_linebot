// 改用共用 SubscribeCardCouponService 後行為不變的回歸：張數/卡種/既有 CLI 輸出。
jest.mock("../../src/service/SubscribeCardCouponService", () => ({
  issue: jest.fn().mockResolvedValue([]),
  MAX_ISSUE_COUNT: 100,
  ALLOWED_KEYS: new Set(["month", "season"]),
}));

const SubscribeCardCouponService = require("../../src/service/SubscribeCardCouponService");
const main = require("../IssueSubscribeCard");

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
});

describe("IssueSubscribeCard CLI", () => {
  it("預設 key=month, count=1 時呼叫共用 service.issue 一次", async () => {
    await main({});

    expect(SubscribeCardCouponService.issue).toHaveBeenCalledTimes(1);
    expect(SubscribeCardCouponService.issue).toHaveBeenCalledWith({
      cardKey: "month",
      count: 1,
      issuedBy: "system",
    });
  });

  it("指定 count/key 會原封不動傳給 service", async () => {
    await main({ count: 5, key: "season" });

    expect(SubscribeCardCouponService.issue).toHaveBeenCalledWith({
      cardKey: "season",
      count: 5,
      issuedBy: "system",
    });
  });

  it("count 為 number 型別時會 parseInt 正規化（既有 isNumber 判斷邏輯不變）", async () => {
    await main({ count: 10.9, key: "month" });

    expect(SubscribeCardCouponService.issue).toHaveBeenCalledWith({
      cardKey: "month",
      count: 10,
      issuedBy: "system",
    });
  });

  it("不合法的 key 直接拒絕，不呼叫 service", async () => {
    await main({ key: "lifetime" });

    expect(SubscribeCardCouponService.issue).not.toHaveBeenCalled();
  });

  it("count 超過上限（101）直接拒絕，不呼叫 service（與既有 CLI 門檻一致）", async () => {
    await main({ count: 101 });

    expect(SubscribeCardCouponService.issue).not.toHaveBeenCalled();
  });

  it("count 剛好等於上限（100）仍允許", async () => {
    await main({ count: 100 });

    expect(SubscribeCardCouponService.issue).toHaveBeenCalledWith({
      cardKey: "month",
      count: 100,
      issuedBy: "system",
    });
  });
});
