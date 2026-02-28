const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/handler/Equipment", () => ({
  admin: {
    getAllEquipment: jest.fn((req, res) => res.json([])),
    getEquipmentById: jest.fn((req, res) => res.json({ id: req.params.id })),
    storeEquipment: jest.fn((req, res) => res.status(201).json({ id: 1 })),
    updateEquipment: jest.fn((req, res) => res.json({ success: true })),
    deleteEquipment: jest.fn((req, res) => res.json({ success: true })),
  },
  player: {
    getMyEquipment: jest.fn((req, res) => res.json({ equipment: [] })),
    getAvailableEquipment: jest.fn((req, res) => res.json({ equipment: [] })),
    equip: jest.fn((req, res) => res.json({ success: true })),
    unequip: jest.fn((req, res) => res.json({ success: true })),
  },
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/game/equipment/me", () => {
  it("returns 200 with player equipment", async () => {
    const res = await request(app)
      .get("/api/game/equipment/me")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ equipment: [] });
  });
});

describe("GET /api/game/equipment/available", () => {
  it("returns 200 with available equipment", async () => {
    const res = await request(app)
      .get("/api/game/equipment/available")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ equipment: [] });
  });
});

describe("POST /api/game/equipment/equip", () => {
  it("returns 200 with success response", async () => {
    const res = await request(app)
      .post("/api/game/equipment/equip")
      .set("Authorization", "Bearer test-token")
      .send({ equipmentId: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("POST /api/game/equipment/unequip", () => {
  it("returns 200 with success response", async () => {
    const res = await request(app)
      .post("/api/game/equipment/unequip")
      .set("Authorization", "Bearer test-token")
      .send({ equipmentId: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
