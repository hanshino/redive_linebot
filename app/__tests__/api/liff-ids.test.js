const request = require("supertest");
const createApp = require("../helpers/createApp");

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/liff-ids", () => {
  const savedEnv = {};

  beforeEach(() => {
    savedEnv.LINE_LIFF_COMPACT_ID = process.env.LINE_LIFF_COMPACT_ID;
    savedEnv.LINE_LIFF_TALL_ID = process.env.LINE_LIFF_TALL_ID;
    savedEnv.LINE_LIFF_FULL_ID = process.env.LINE_LIFF_FULL_ID;
    savedEnv.LINE_LIFF_ID = process.env.LINE_LIFF_ID;
  });

  afterEach(() => {
    process.env.LINE_LIFF_COMPACT_ID = savedEnv.LINE_LIFF_COMPACT_ID;
    process.env.LINE_LIFF_TALL_ID = savedEnv.LINE_LIFF_TALL_ID;
    process.env.LINE_LIFF_FULL_ID = savedEnv.LINE_LIFF_FULL_ID;
    process.env.LINE_LIFF_ID = savedEnv.LINE_LIFF_ID;
  });

  it("returns full LIFF ID when size=full", async () => {
    process.env.LINE_LIFF_FULL_ID = "full-123";

    const res = await request(app).get("/api/liff-ids").query({ size: "full" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "full-123" });
  });

  it("returns compact LIFF ID when size=compact", async () => {
    process.env.LINE_LIFF_COMPACT_ID = "compact-123";

    const res = await request(app).get("/api/liff-ids").query({ size: "compact" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "compact-123" });
  });

  it("returns tall LIFF ID when size=tall", async () => {
    process.env.LINE_LIFF_TALL_ID = "tall-123";

    const res = await request(app).get("/api/liff-ids").query({ size: "tall" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "tall-123" });
  });

  it("falls back to LINE_LIFF_ID when specific size env is not set", async () => {
    delete process.env.LINE_LIFF_FULL_ID;
    process.env.LINE_LIFF_ID = "fallback-123";

    const res = await request(app).get("/api/liff-ids").query({ size: "full" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "fallback-123" });
  });
});
