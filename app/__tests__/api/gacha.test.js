const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/controller/princess/gacha", () => ({
  api: {
    showGachaPool: jest.fn((req, res) => res.json([])),
    updateCharacter: jest.fn((req, res) => res.json({ success: true })),
    insertCharacter: jest.fn((req, res) => res.status(201).json({ id: 1 })),
    deleteCharacter: jest.fn((req, res) => res.json({ success: true })),
    showGachaRank: jest.fn((req, res) => res.json({ type: req.params.type, rankings: [] })),
    showGodStoneRank: jest.fn((req, res) => res.json({ rankings: [] })),
  },
  play: jest.fn(),
  showGachaBag: jest.fn(),
  purgeDailyGachaCache: jest.fn(),
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/gacha/rankings/:type", () => {
  it("returns 200 with rankings for the given type", async () => {
    const res = await request(app).get("/api/gacha/rankings/ssr");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: "ssr", rankings: [] });
  });

  it("passes the type parameter correctly", async () => {
    const res = await request(app).get("/api/gacha/rankings/collected");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: "collected", rankings: [] });
  });
});

describe("GET /api/god-stone/rankings", () => {
  it("returns 200 with god stone rankings", async () => {
    const res = await request(app).get("/api/god-stone/rankings");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rankings: [] });
  });
});
