const request = require("supertest");
const createApp = require("../helpers/createApp");

let app;
beforeAll(() => {
  app = createApp();
});

describe("API catch-all 404", () => {
  it("GET /api/nonexistent returns 404", async () => {
    const res = await request(app).get("/api/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "invalid api url." });
  });

  it("POST /api/nonexistent returns 404", async () => {
    const res = await request(app).post("/api/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "invalid api url." });
  });
});
