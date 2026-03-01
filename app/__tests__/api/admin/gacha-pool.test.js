const request = require("supertest");
const createApp = require("../../helpers/createApp");

jest.mock("../../../src/controller/princess/gacha", () => ({
  api: {
    showGachaPool: jest.fn((req, res) => res.json([])),
    updateCharacter: jest.fn((req, res) => res.json({ success: true })),
    insertCharacter: jest.fn((req, res) => res.status(201).json({ id: 1 })),
    deleteCharacter: jest.fn((req, res) => res.json({ success: true })),
    showGachaRank: jest.fn((req, res) => res.json([])),
    showGodStoneRank: jest.fn((req, res) => res.json([])),
  },
  play: jest.fn(),
  showGachaBag: jest.fn(),
  purgeDailyGachaCache: jest.fn(),
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/admin/gacha-pool", () => {
  it("returns 200 with gacha pool data", async () => {
    const res = await request(app).get("/api/admin/gacha-pool");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("PUT /api/admin/gacha-pool", () => {
  it("returns 200 on successful character update", async () => {
    const res = await request(app)
      .put("/api/admin/gacha-pool")
      .send({ id: 1, name: "updated" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("POST /api/admin/gacha-pool", () => {
  it("returns 201 on successful character insert", async () => {
    const res = await request(app)
      .post("/api/admin/gacha-pool")
      .send({ name: "new character" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1 });
  });
});

describe("DELETE /api/admin/gacha-pool/:id", () => {
  it("returns 200 on successful character deletion", async () => {
    const res = await request(app).delete("/api/admin/gacha-pool/42");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
