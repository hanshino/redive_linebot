const request = require("supertest");
const createApp = require("../helpers/createApp");

const { webhook } = require("../../src/util/discord");

let app;
beforeAll(() => {
  app = createApp();
});

describe("POST /api/discord/webhook-test", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 when webhook test succeeds", async () => {
    webhook.test.mockResolvedValue(true);

    const res = await request(app)
      .post("/api/discord/webhook-test")
      .send({ webhook: "https://discord.com/api/webhooks/123/abc" });

    expect(res.status).toBe(200);
    expect(webhook.test).toHaveBeenCalledWith("https://discord.com/api/webhooks/123/abc");
  });

  it("returns 403 when webhook test fails", async () => {
    webhook.test.mockResolvedValue(false);

    const res = await request(app)
      .post("/api/discord/webhook-test")
      .send({ webhook: "https://discord.com/api/webhooks/invalid" });

    expect(res.status).toBe(403);
    expect(webhook.test).toHaveBeenCalledWith("https://discord.com/api/webhooks/invalid");
  });

  it("returns 403 when webhook test throws", async () => {
    webhook.test.mockRejectedValue(new Error("Network error"));

    const res = await request(app)
      .post("/api/discord/webhook-test")
      .send({ webhook: "https://discord.com/api/webhooks/error" });

    expect(res.status).toBe(403);
    expect(webhook.test).toHaveBeenCalledWith("https://discord.com/api/webhooks/error");
  });
});
