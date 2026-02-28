const request = require("supertest");
const createApp = require("../helpers/createApp");

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/group-config", () => {
  it("returns 200 with group config array", async () => {
    const res = await request(app).get("/api/group-config");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    res.body.forEach(item => {
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("description");
      expect(item).toHaveProperty("name");
    });
  });

  it("contains expected config entries", async () => {
    const res = await request(app).get("/api/group-config");

    const names = res.body.map(item => item.name);
    expect(names).toContain("PrincessCharacter");
    expect(names).toContain("CustomerOrder");
    expect(names).toContain("Gacha");
  });
});
