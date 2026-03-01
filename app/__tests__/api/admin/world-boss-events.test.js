const request = require("supertest");
const createApp = require("../../helpers/createApp");

jest.mock("../../../src/handler/WorldBossEvent", () => ({
  admin: {
    all: jest.fn((req, res) => res.json([])),
    find: jest.fn((req, res) => res.json({ id: req.params.id })),
    create: jest.fn((req, res) => res.status(201).json({ id: 1 })),
    update: jest.fn((req, res) => res.json({ success: true })),
    destroy: jest.fn((req, res) => res.json({ success: true })),
  },
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/admin/world-boss-events", () => {
  it("returns 200 with all world boss events", async () => {
    const res = await request(app).get("/api/admin/world-boss-events");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/admin/world-boss-events/:id", () => {
  it("returns 200 with the requested world boss event", async () => {
    const res = await request(app).get("/api/admin/world-boss-events/3");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "3" });
  });
});

describe("POST /api/admin/world-boss-events", () => {
  it("returns 201 on successful world boss event creation", async () => {
    const res = await request(app)
      .post("/api/admin/world-boss-events")
      .send({ name: "Raid Event" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1 });
  });
});

describe("PUT /api/admin/world-boss-events/:id", () => {
  it("returns 200 on successful world boss event update", async () => {
    const res = await request(app)
      .put("/api/admin/world-boss-events/3")
      .send({ name: "Updated Raid Event" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("DELETE /api/admin/world-boss-events/:id", () => {
  it("returns 200 on successful world boss event deletion", async () => {
    const res = await request(app).delete("/api/admin/world-boss-events/3");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
