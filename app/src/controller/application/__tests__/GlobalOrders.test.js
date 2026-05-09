jest.mock("../../../model/application/GlobalOrders", () => ({
  insertData: jest.fn(),
  updateData: jest.fn(),
  deleteData: jest.fn(),
  fetchAllData: jest.fn(),
}));
jest.mock("../../../templates/application/Order", () => ({ send: jest.fn() }));
jest.mock("../../../util/traffic", () => ({ recordSign: jest.fn() }));
jest.mock("../../../util/umami", () => ({ track: jest.fn(), getSourceData: jest.fn() }));

const OrderModel = require("../../../model/application/GlobalOrders");
const controller = require("../GlobalOrders");

function mockReqRes(body = {}) {
  let status = 200;
  let payload;
  const res = {
    status(c) {
      status = c;
      return this;
    },
    json(o) {
      payload = o;
    },
  };
  const next = jest.fn();
  return { req: { body, params: {} }, res, next, get: () => ({ status, payload }) };
}

describe("GlobalOrders.api.insertGlobalOrders", () => {
  beforeEach(() => jest.clearAllMocks());

  it("coerces empty senderName/senderIcon to null instead of leaving them undefined", async () => {
    const { req, res, next } = mockReqRes({
      orderKey: "",
      order: "hi",
      touchType: "1",
      senderName: "",
      senderIcon: "",
      replyDatas: [{ messageType: "text", reply: "yo" }],
    });

    await controller.api.insertGlobalOrders(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const passed = OrderModel.insertData.mock.calls[0][0];
    expect(passed.senderName).toBeNull();
    expect(passed.senderIcon).toBeNull();
    expect(passed.replyDatas[0].messageType).toBe("text");
  });

  it("defaults missing replyData.messageType to 'text'", async () => {
    const { req, res, next } = mockReqRes({
      orderKey: "",
      order: "hi",
      touchType: "1",
      senderName: "x",
      senderIcon: "y",
      replyDatas: [{ reply: "yo" }],
    });

    await controller.api.insertGlobalOrders(req, res, next);

    const passed = OrderModel.insertData.mock.calls[0][0];
    expect(passed.replyDatas[0].messageType).toBe("text");
    expect(passed.replyDatas[0].reply).toBe("yo");
  });

  it("rejects empty replyDatas with 400 (not 5xx)", async () => {
    const { req, res, next, get } = mockReqRes({
      orderKey: "",
      order: "hi",
      touchType: "1",
      replyDatas: [],
    });

    await controller.api.insertGlobalOrders(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(get().status).toBe(400);
    expect(OrderModel.insertData).not.toHaveBeenCalled();
  });

  it("forwards model errors via next() instead of rethrowing into async void", async () => {
    OrderModel.insertData.mockRejectedValueOnce(new Error("boom"));
    const { req, res, next } = mockReqRes({
      orderKey: "",
      order: "hi",
      touchType: "1",
      replyDatas: [{ messageType: "text", reply: "yo" }],
    });

    await controller.api.insertGlobalOrders(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("caps replyDatas at 5 entries", async () => {
    const { req, res, next } = mockReqRes({
      orderKey: "",
      order: "hi",
      touchType: "1",
      replyDatas: Array.from({ length: 8 }, (_, i) => ({ messageType: "text", reply: `r${i}` })),
    });

    await controller.api.insertGlobalOrders(req, res, next);

    const passed = OrderModel.insertData.mock.calls[0][0];
    expect(passed.replyDatas).toHaveLength(5);
  });
});

describe("GlobalOrders.api.updateGlobalOrders", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects missing orderKey with 400", async () => {
    const { req, res, next, get } = mockReqRes({
      orderKey: "",
      order: "hi",
      touchType: "1",
      replyDatas: [{ messageType: "text", reply: "yo" }],
    });

    await controller.api.updateGlobalOrders(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(get().status).toBe(400);
    expect(OrderModel.updateData).not.toHaveBeenCalled();
  });

  it("normalizes payload before calling model", async () => {
    const { req, res, next } = mockReqRes({
      orderKey: "abc",
      order: "hi",
      touchType: "1",
      senderName: "",
      senderIcon: "",
      replyDatas: [{ reply: "yo" }],
    });

    await controller.api.updateGlobalOrders(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const passed = OrderModel.updateData.mock.calls[0][0];
    expect(passed.orderKey).toBe("abc");
    expect(passed.senderName).toBeNull();
    expect(passed.senderIcon).toBeNull();
    expect(passed.replyDatas[0].messageType).toBe("text");
  });
});
