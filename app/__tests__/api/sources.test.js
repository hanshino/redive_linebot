const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/controller/application/CustomerOrder", () => ({
  api: {
    fetchCustomerOrders: jest.fn((req, res) => res.json({ orders: [] })),
    insertOrder: jest.fn((req, res) => res.status(201).json({ success: true })),
    updateOrder: jest.fn((req, res) => res.json({ success: true })),
    setCustomerOrderStatus: jest.fn((req, res) => res.json({ success: true })),
  },
  insertCustomerOrder: jest.fn(),
  CustomerOrderDetect: jest.fn(),
  deleteCustomerOrder: jest.fn(),
}));

const CustomerOrderController = require("../../src/controller/application/CustomerOrder");

const sourceId = "C" + "a".repeat(32);

let app;
beforeAll(() => {
  app = createApp();
});

describe("Customer Order API endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/sources/:sourceId/custom-orders", () => {
    it("returns 200 with orders", async () => {
      const res = await request(app).get(`/api/sources/${sourceId}/custom-orders`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ orders: [] });
      expect(CustomerOrderController.api.fetchCustomerOrders).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/sources/:sourceId/custom-orders", () => {
    it("returns 201 on success", async () => {
      const res = await request(app)
        .post(`/api/sources/${sourceId}/custom-orders`)
        .send({ order: "test", reply: "response" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true });
      expect(CustomerOrderController.api.insertOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe("PUT /api/sources/:sourceId/custom-orders", () => {
    it("returns 200 on success", async () => {
      const res = await request(app)
        .put(`/api/sources/${sourceId}/custom-orders`)
        .send({ order: "test", reply: "updated" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(CustomerOrderController.api.updateOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe("PUT /api/sources/:sourceId/custom-orders/:orderKey/status", () => {
    it("returns 200 on success", async () => {
      const res = await request(app).put(`/api/sources/${sourceId}/custom-orders/my-order/status`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(CustomerOrderController.api.setCustomerOrderStatus).toHaveBeenCalledTimes(1);
    });
  });
});
