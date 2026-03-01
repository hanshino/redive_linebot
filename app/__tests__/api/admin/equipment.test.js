const request = require("supertest");
const createApp = require("../../helpers/createApp");

jest.mock("../../../src/handler/Equipment", () => ({
  admin: {
    getAllEquipment: jest.fn((req, res) => res.json([])),
    getEquipmentById: jest.fn((req, res) => res.json({ id: req.params.id })),
    storeEquipment: jest.fn((req, res) => res.status(201).json({ id: 1 })),
    updateEquipment: jest.fn((req, res) => res.json({ success: true })),
    deleteEquipment: jest.fn((req, res) => res.json({ success: true })),
  },
  player: {
    getMyEquipment: jest.fn((req, res) => res.json([])),
    getAvailableEquipment: jest.fn((req, res) => res.json([])),
    equip: jest.fn((req, res) => res.json({ success: true })),
    unequip: jest.fn((req, res) => res.json({ success: true })),
  },
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/admin/equipment", () => {
  it("returns 200 with all equipment", async () => {
    const res = await request(app).get("/api/admin/equipment");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/admin/equipment/:id", () => {
  it("returns 200 with the requested equipment", async () => {
    const res = await request(app).get("/api/admin/equipment/7");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "7" });
  });
});

describe("POST /api/admin/equipment", () => {
  it("returns 201 on successful equipment creation", async () => {
    const res = await request(app)
      .post("/api/admin/equipment")
      .send({ name: "Sword" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1 });
  });
});

describe("PUT /api/admin/equipment/:id", () => {
  it("returns 200 on successful equipment update", async () => {
    const res = await request(app)
      .put("/api/admin/equipment/7")
      .send({ name: "Updated Sword" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("DELETE /api/admin/equipment/:id", () => {
  it("returns 200 on successful equipment deletion", async () => {
    const res = await request(app).delete("/api/admin/equipment/7");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
