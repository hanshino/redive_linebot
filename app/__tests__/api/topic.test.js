const request = require("supertest");
const createApp = require("../helpers/createApp");

// The query module is the single source of truth (service/topic/query); the
// endpoints must delegate to it, never reimplement the SQL.
jest.mock("../../src/service/topic/query", () => ({
  topUserKeywords: jest.fn(),
  topGroupKeywords: jest.fn(),
}));

const TopicQuery = require("../../src/service/topic/query");

// __tests__/setup.js mocks verifyToken to inject this userId into req.profile.
const TOKEN_USER_ID = "U" + "a".repeat(32);
const GROUP_ID = "C" + "b".repeat(32);

let app;
beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/topic/me", () => {
  it("returns the personal keyword list shape from topUserKeywords", async () => {
    TopicQuery.topUserKeywords.mockResolvedValue([
      { keyword: "凱留", count: 40 },
      { keyword: "笑死", count: 22 },
    ]);

    const res = await request(app).get("/api/topic/me").set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { keyword: "凱留", count: 40 },
      { keyword: "笑死", count: 22 },
    ]);
  });

  it("reads userId from the validated token, never from the query string", async () => {
    TopicQuery.topUserKeywords.mockResolvedValue([]);

    await request(app)
      .get(`/api/topic/me?userId=${"U" + "c".repeat(32)}`)
      .set("Authorization", "Bearer test-token");

    expect(TopicQuery.topUserKeywords).toHaveBeenCalledWith(
      TOKEN_USER_ID,
      expect.objectContaining({ groupId: null, days: 30 })
    );
    // the attacker-supplied userId must be ignored
    expect(TopicQuery.topUserKeywords).not.toHaveBeenCalledWith(
      "U" + "c".repeat(32),
      expect.anything()
    );
  });

  it("clamps days to {7, 30}, defaulting to 30", async () => {
    TopicQuery.topUserKeywords.mockResolvedValue([]);

    await request(app).get("/api/topic/me?days=7").set("Authorization", "Bearer test-token");
    expect(TopicQuery.topUserKeywords).toHaveBeenLastCalledWith(
      TOKEN_USER_ID,
      expect.objectContaining({ days: 7 })
    );

    await request(app).get("/api/topic/me?days=999").set("Authorization", "Bearer test-token");
    expect(TopicQuery.topUserKeywords).toHaveBeenLastCalledWith(
      TOKEN_USER_ID,
      expect.objectContaining({ days: 30 })
    );

    await request(app).get("/api/topic/me").set("Authorization", "Bearer test-token");
    expect(TopicQuery.topUserKeywords).toHaveBeenLastCalledWith(
      TOKEN_USER_ID,
      expect.objectContaining({ days: 30 })
    );
  });

  it("passes a valid groupId through, ignores a malformed one", async () => {
    TopicQuery.topUserKeywords.mockResolvedValue([]);

    await request(app)
      .get(`/api/topic/me?groupId=${GROUP_ID}`)
      .set("Authorization", "Bearer test-token");
    expect(TopicQuery.topUserKeywords).toHaveBeenLastCalledWith(
      TOKEN_USER_ID,
      expect.objectContaining({ groupId: GROUP_ID })
    );

    await request(app)
      .get("/api/topic/me?groupId=not-a-group")
      .set("Authorization", "Bearer test-token");
    expect(TopicQuery.topUserKeywords).toHaveBeenLastCalledWith(
      TOKEN_USER_ID,
      expect.objectContaining({ groupId: null })
    );
  });
});

describe("GET /api/topic/group/:groupId", () => {
  it("returns the group keyword list shape from topGroupKeywords", async () => {
    TopicQuery.topGroupKeywords.mockResolvedValue([
      { keyword: "世界王", count: 120, userCount: 18 },
    ]);

    const res = await request(app)
      .get(`/api/topic/group/${GROUP_ID}`)
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ keyword: "世界王", count: 120, userCount: 18 }]);
    expect(TopicQuery.topGroupKeywords).toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({ days: 30 })
    );
  });

  it("clamps days to {7, 30}", async () => {
    TopicQuery.topGroupKeywords.mockResolvedValue([]);

    await request(app)
      .get(`/api/topic/group/${GROUP_ID}?days=7`)
      .set("Authorization", "Bearer test-token");
    expect(TopicQuery.topGroupKeywords).toHaveBeenLastCalledWith(
      GROUP_ID,
      expect.objectContaining({ days: 7 })
    );
  });
});
