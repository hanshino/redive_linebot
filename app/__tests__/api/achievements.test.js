// Achievement API 洩漏防線：condition / notify_* 是機密（玩家會挖 API 與 codebase），
// 只要從 HTTP 出去的 payload 帶到就算破功。
const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/model/application/Achievement", () => ({
  allWithCategories: jest.fn(),
}));
jest.mock("../../src/service/AchievementEngine", () => ({
  getUserSummary: jest.fn(),
  getStats: jest.fn(),
}));

const AchievementModel = require("../../src/model/application/Achievement");
const AchievementEngine = require("../../src/service/AchievementEngine");

const SECRET_ROW = {
  id: 1,
  key: "secret_key",
  name: "秘密成就",
  description: "描述",
  icon: "🗝",
  type: "hidden",
  rarity: 3,
  target_value: 30,
  reward_stones: 500,
  order: 1,
  category_key: "signin",
  category_name: "簽到",
  category_icon: "🗓",
  category_id: 9,
  condition: { event: "signin", metric: "streak", month: "2026-08", minValue: 30 },
  notify_on_unlock: true,
  notify_message: "解鎖秘密成就 {name}",
  created_at: "2026-01-01",
  updated_at: "2026-01-02",
};

const PRIVATE_KEYS = [
  "condition",
  "notify_message",
  "notify_on_unlock",
  "category_id",
  "created_at",
  "updated_at",
];

let app;
beforeAll(() => {
  app = createApp();
});
beforeEach(() => jest.clearAllMocks());

describe("GET /api/achievements", () => {
  it("returns only public fields", async () => {
    AchievementModel.allWithCategories.mockResolvedValue([SECRET_ROW]);

    const res = await request(app).get("/api/achievements");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    PRIVATE_KEYS.forEach(k => expect(res.body[0]).not.toHaveProperty(k));
    expect(res.body[0]).toMatchObject({
      id: 1,
      key: "secret_key",
      name: "秘密成就",
      description: "描述",
      icon: "🗝",
      type: "hidden",
      rarity: 3,
      target_value: 30,
      reward_stones: 500,
      order: 1,
      category_key: "signin",
      category_name: "簽到",
      category_icon: "🗓",
    });
  });

  it("leaks no secret substring in the raw response body", async () => {
    AchievementModel.allWithCategories.mockResolvedValue([SECRET_ROW]);

    const res = await request(app).get("/api/achievements");

    expect(res.text).not.toContain("condition");
    expect(res.text).not.toContain("notify_message");
    expect(res.text).not.toContain("minValue");
    expect(res.text).not.toContain("解鎖秘密成就");
  });
});

describe("GET /api/achievements/user/:userId", () => {
  it("passes through the already-projected summary without private fields", async () => {
    // getUserSummary 自己就會投影（見 AchievementEngine 測試），
    // 這裡確認 controller 沒有在外面又把原始 row 塞回去。
    AchievementEngine.getUserSummary.mockResolvedValue({
      total: 1,
      unlocked: 0,
      percentage: 0,
      categories: [
        {
          key: "signin",
          achievements: [{ id: 1, key: "secret_key", name: "秘密成就", isUnlocked: false }],
        },
      ],
      recentUnlocks: [],
      nearCompletion: [],
      profile: null,
    });

    const res = await request(app).get("/api/achievements/user/Uabc");

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("condition");
    expect(res.text).not.toContain("notify_message");
    expect(res.body.categories[0].achievements[0].key).toBe("secret_key");
  });
});
