// SubscribeCardCouponService.issue — ALLOWED_KEYS whitelist regression.
// month_plus 加入白名單後，發卡（後台與 CLI）都應該能發 Plus 序號；其餘驗證不變。

jest.mock("../../model/application/SubscribeCardCoupon", () => ({
  status: { unused: 0, used: 1 },
  insert: jest.fn().mockResolvedValue(undefined),
}));

const SubscribeCardCoupon = require("../../model/application/SubscribeCardCoupon");
const SubscribeCardCouponService = require("../SubscribeCardCouponService");

describe("SubscribeCardCouponService.ALLOWED_KEYS", () => {
  it("includes month, season, and month_plus", () => {
    expect(SubscribeCardCouponService.ALLOWED_KEYS).toEqual(
      new Set(["month", "season", "month_plus"])
    );
  });
});

describe("SubscribeCardCouponService.issue", () => {
  beforeEach(() => jest.clearAllMocks());

  it("issues month_plus coupons with the same shape as month/season", async () => {
    const coupons = await SubscribeCardCouponService.issue({
      cardKey: "month_plus",
      count: 2,
      issuedBy: "system",
    });

    expect(coupons).toHaveLength(2);
    for (const c of coupons) {
      expect(c.subscribe_card_key).toBe("month_plus");
      expect(c.status).toBe(SubscribeCardCoupon.status.unused);
      expect(c.issued_by).toBe("system");
      expect(c.sponsorship_id).toBeNull();
    }
    expect(SubscribeCardCoupon.insert).toHaveBeenCalledTimes(1);
  });

  it("still rejects unknown card keys", async () => {
    await expect(
      SubscribeCardCouponService.issue({ cardKey: "lifetime", count: 1, issuedBy: "system" })
    ).rejects.toMatchObject({ code: "INVALID_CARD_KEY" });
  });
});
