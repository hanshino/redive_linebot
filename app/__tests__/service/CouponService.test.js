// jest.mock MUST precede requires (jest.config transform:{} = no hoist)
jest.mock("../../src/model/application/CouponCode", () => ({
  findByCode: jest.fn(),
  find: jest.fn(),
  all: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}));
jest.mock("../../src/model/application/CouponUsedHistory", () => ({
  countGroupedByCoupon: jest.fn(),
  countByCoupon: jest.fn(),
  recentByCoupon: jest.fn(),
  dailyByCoupon: jest.fn(),
}));

const CouponCode = require("../../src/model/application/CouponCode");
const CouponUsedHistory = require("../../src/model/application/CouponUsedHistory");
const CouponService = require("../../src/service/CouponService");

const valid = {
  code: "XMAS",
  startAt: "2026-12-01T00:00:00Z",
  endAt: "2026-12-31T00:00:00Z",
  reward: 500,
};

beforeEach(() => jest.clearAllMocks());

describe("CouponService.create", () => {
  it("creates with wrapped reward + Date fields, returns id", async () => {
    CouponCode.findByCode.mockResolvedValue(undefined);
    CouponCode.create.mockResolvedValue(7);

    const id = await CouponService.create(valid);

    expect(id).toBe(7);
    const row = CouponCode.create.mock.calls[0][0];
    expect(row.code).toBe("XMAS");
    expect(row.reward).toEqual({ type: "god_stone", value: 500 });
    expect(row.start_at).toBeInstanceOf(Date);
    expect(row.end_at).toBeInstanceOf(Date);
  });

  it("throws COUPON_INVALID on bad payload", async () => {
    await expect(CouponService.create({ ...valid, reward: 0 })).rejects.toMatchObject({
      code: "COUPON_INVALID",
    });
  });

  it("throws COUPON_INVALID when endAt <= startAt", async () => {
    CouponCode.findByCode.mockResolvedValue(undefined);
    await expect(CouponService.create({ ...valid, endAt: valid.startAt })).rejects.toMatchObject({
      code: "COUPON_INVALID",
    });
  });

  it("throws COUPON_DUPLICATED when code exists", async () => {
    CouponCode.findByCode.mockResolvedValue({ id: 1, code: "XMAS" });
    await expect(CouponService.create(valid)).rejects.toMatchObject({
      code: "COUPON_DUPLICATED",
    });
  });
});

describe("CouponService.list", () => {
  it("merges redeemedCount (0 when none)", async () => {
    CouponCode.all.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    CouponUsedHistory.countGroupedByCoupon.mockResolvedValue([{ coupon_code_id: 1, count: "3" }]);

    const rows = await CouponService.list();

    expect(rows).toEqual([
      { id: 1, redeemedCount: 3 },
      { id: 2, redeemedCount: 0 },
    ]);
  });
});

describe("CouponService.find", () => {
  it("returns null when missing", async () => {
    CouponCode.find.mockResolvedValue(undefined);
    expect(await CouponService.find(9)).toBeNull();
  });

  it("returns coupon + stats", async () => {
    CouponCode.find.mockResolvedValue({ id: 1, code: "X" });
    CouponUsedHistory.countByCoupon.mockResolvedValue(2);
    CouponUsedHistory.recentByCoupon.mockResolvedValue([
      { user_id: "U1", created_at: "2026-12-02T00:00:00Z" },
    ]);
    CouponUsedHistory.dailyByCoupon.mockResolvedValue([{ date: "2026-12-02", count: "2" }]);

    const out = await CouponService.find(1);

    expect(out.redeemedCount).toBe(2);
    expect(out.redemptions).toHaveLength(1);
    expect(out.dailyRedemptions).toEqual([{ date: "2026-12-02", count: 2 }]);
  });
});

describe("CouponService.update", () => {
  it("throws COUPON_NOT_FOUND when missing", async () => {
    CouponCode.find.mockResolvedValue(undefined);
    await expect(CouponService.update(9, valid)).rejects.toMatchObject({
      code: "COUPON_NOT_FOUND",
    });
  });

  it("locks code change when redeemed", async () => {
    CouponCode.find.mockResolvedValue({ id: 1, code: "OLD" });
    CouponUsedHistory.countByCoupon.mockResolvedValue(1);
    await expect(CouponService.update(1, valid)).rejects.toMatchObject({
      code: "COUPON_CODE_LOCKED",
    });
  });

  it("rejects duplicate new code", async () => {
    CouponCode.find.mockResolvedValue({ id: 1, code: "OLD" });
    CouponUsedHistory.countByCoupon.mockResolvedValue(0);
    CouponCode.findByCode.mockResolvedValue({ id: 2, code: "XMAS" });
    await expect(CouponService.update(1, valid)).rejects.toMatchObject({
      code: "COUPON_DUPLICATED",
    });
  });

  it("updates dates/reward when code unchanged", async () => {
    CouponCode.find.mockResolvedValue({ id: 1, code: "XMAS" });
    CouponCode.update.mockResolvedValue(1);
    await CouponService.update(1, valid);
    expect(CouponCode.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ reward: { type: "god_stone", value: 500 } })
    );
    expect(CouponUsedHistory.countByCoupon).not.toHaveBeenCalled();
  });
});

describe("CouponService.destroy", () => {
  it("throws COUPON_NOT_FOUND when missing", async () => {
    CouponCode.find.mockResolvedValue(undefined);
    await expect(CouponService.destroy(9)).rejects.toMatchObject({
      code: "COUPON_NOT_FOUND",
    });
  });

  it("throws COUPON_HAS_REDEMPTIONS when used", async () => {
    CouponCode.find.mockResolvedValue({ id: 1 });
    CouponUsedHistory.countByCoupon.mockResolvedValue(1);
    await expect(CouponService.destroy(1)).rejects.toMatchObject({
      code: "COUPON_HAS_REDEMPTIONS",
    });
  });

  it("deletes when unused", async () => {
    CouponCode.find.mockResolvedValue({ id: 1 });
    CouponUsedHistory.countByCoupon.mockResolvedValue(0);
    CouponCode.delete.mockResolvedValue(1);
    await CouponService.destroy(1);
    expect(CouponCode.delete).toHaveBeenCalledWith(1);
  });
});
