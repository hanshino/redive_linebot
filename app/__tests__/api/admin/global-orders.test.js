const request = require("supertest");
const createApp = require("../../helpers/createApp");

jest.mock("../../../src/controller/application/GlobalOrders", () => ({
  api: {
    showGlobalOrders: jest.fn((req, res) => res.json([])),
    insertGlobalOrders: jest.fn((req, res) => res.status(201).json({ success: true })),
    updateGlobalOrders: jest.fn((req, res) => res.json({ success: true })),
    deleteGlobalOrders: jest.fn((req, res) => res.json({ success: true })),
  },
  GlobalOrderBase: jest.fn(),
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/admin/global-orders", () => {
  it("returns 200 with global orders list", async () => {
    const res = await request(app).get("/api/admin/global-orders");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/admin/global-orders", () => {
  it("returns 201 on successful order creation", async () => {
    const res = await request(app)
      .post("/api/admin/global-orders")
      .send({ orderKey: "test", reply: "hello" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true });
  });
});

describe("PUT /api/admin/global-orders", () => {
  it("returns 200 on successful order update", async () => {
    const res = await request(app)
      .put("/api/admin/global-orders")
      .send({ orderKey: "test", reply: "updated" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("DELETE /api/admin/global-orders/:orderKey", () => {
  it("returns 200 on successful order deletion", async () => {
    const res = await request(app).delete("/api/admin/global-orders/test-key");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
