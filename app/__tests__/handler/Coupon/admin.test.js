jest.mock("../../../src/service/CouponService", () => ({
  list: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
}));
jest.mock("../../../src/util/i18n", () => ({ __: jest.fn(k => k) }));

const CouponService = require("../../../src/service/CouponService");
const handler = require("../../../src/handler/Coupon/admin");

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}
const req = (over = {}) => ({ params: {}, body: {}, ...over });

beforeEach(() => jest.clearAllMocks());

it("list -> 200 with data", async () => {
  CouponService.list.mockResolvedValue([{ id: 1 }]);
  const res = mockRes();
  await handler.list(req(), res);
  expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
});

it("detail -> 404 when null", async () => {
  CouponService.find.mockResolvedValue(null);
  const res = mockRes();
  await handler.detail(req({ params: { id: "9" } }), res);
  expect(res.status).toHaveBeenCalledWith(404);
});

it("store -> 201 with id", async () => {
  CouponService.create.mockResolvedValue(5);
  const res = mockRes();
  await handler.store(req({ body: { code: "X" } }), res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({ id: 5 });
});

it("store -> 400 on COUPON_INVALID", async () => {
  CouponService.create.mockRejectedValue(
    Object.assign(new Error(), { code: "COUPON_INVALID", errors: [] })
  );
  const res = mockRes();
  await handler.store(req(), res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it("update -> 409 on COUPON_CODE_LOCKED", async () => {
  CouponService.update.mockRejectedValue(
    Object.assign(new Error(), { code: "COUPON_CODE_LOCKED" })
  );
  const res = mockRes();
  await handler.update(req({ params: { id: "1" }, body: {} }), res);
  expect(res.status).toHaveBeenCalledWith(409);
});

it("destroy -> 409 on COUPON_HAS_REDEMPTIONS", async () => {
  CouponService.destroy.mockRejectedValue(
    Object.assign(new Error(), { code: "COUPON_HAS_REDEMPTIONS" })
  );
  const res = mockRes();
  await handler.destroy(req({ params: { id: "1" } }), res);
  expect(res.status).toHaveBeenCalledWith(409);
});

it("destroy -> 500 on unknown", async () => {
  CouponService.destroy.mockRejectedValue(new Error("boom"));
  const res = mockRes();
  await handler.destroy(req({ params: { id: "1" } }), res);
  expect(res.status).toHaveBeenCalledWith(500);
});
