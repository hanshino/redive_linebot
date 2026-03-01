const request = require("supertest");
const createApp = require("../../helpers/createApp");

jest.mock("../../../src/handler/WorldBoss", () => ({
  admin: {
    getAllWorldBoss: jest.fn((req, res) => res.json([])),
    getWorldBossById: jest.fn((req, res) => res.json({ id: req.params.id })),
    storeWorldBoss: jest.fn((req, res) => res.status(201).json({ id: 1 })),
    updateWorldBoss: jest.fn((req, res) => res.json({ success: true })),
    deleteWorldBoss: jest.fn((req, res) => res.json({ success: true })),
  },
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/admin/world-bosses", () => {
  it("returns 200 with all world bosses", async () => {
    const res = await request(app).get("/api/admin/world-bosses");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/admin/world-bosses/:id", () => {
  it("returns 200 with the requested world boss", async () => {
    const res = await request(app).get("/api/admin/world-bosses/5");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "5" });
  });
});

describe("POST /api/admin/world-bosses", () => {
  it("returns 201 on successful world boss creation", async () => {
    const res = await request(app)
      .post("/api/admin/world-bosses")
      .send({ name: "Dragon" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1 });
  });
});

describe("PUT /api/admin/world-bosses/:id", () => {
  it("returns 200 on successful world boss update", async () => {
    const res = await request(app)
      .put("/api/admin/world-bosses/5")
      .send({ name: "Updated Dragon" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("DELETE /api/admin/world-bosses/:id", () => {
  it("returns 200 on successful world boss deletion", async () => {
    const res = await request(app).delete("/api/admin/world-bosses/5");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
