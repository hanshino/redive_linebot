const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/controller/application/ChatLevelController", () => ({
  api: {
    queryRank: jest.fn((req, res) => res.json({ rankings: [] })),
  },
  showStatus: jest.fn(),
  showFriendStatus: jest.fn(),
  setEXP: jest.fn(),
  setEXPRate: jest.fn(),
  showRank: jest.fn(),
}));

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/chat-levels/rankings", () => {
  it("returns 200 with rankings data", async () => {
    const res = await request(app).get("/api/chat-levels/rankings");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rankings: [] });
  });
});
