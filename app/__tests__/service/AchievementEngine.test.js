// Mock dependencies BEFORE requiring the module under test
jest.mock("../../src/model/application/Achievement", () => ({
  allWithCategories: jest.fn(),
  findByKey: jest.fn(),
  findByType: jest.fn(),
  getStats: jest.fn(),
}));
jest.mock("../../src/model/application/UserAchievement", () => ({
  findByUser: jest.fn(),
  isUnlocked: jest.fn(),
  unlock: jest.fn(),
  countByUser: jest.fn(),
  getRecentByUser: jest.fn(),
}));
jest.mock("../../src/model/application/UserAchievementProgress", () => ({
  getProgress: jest.fn(),
  upsert: jest.fn(),
  increment: jest.fn(),
  delete: jest.fn(),
  findByUser: jest.fn(),
  getNearCompletion: jest.fn(),
}));
jest.mock("../../src/model/application/AchievementCategory", () => ({
  all: jest.fn(),
}));
jest.mock("../../src/util/Logger", () => ({
  DefaultLogger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../src/util/redis", () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue("OK"),
}));
jest.mock("../../src/util/mysql", () => {
  const mockChain = () => ({
    insert: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    update: jest.fn().mockResolvedValue(1),
    first: jest.fn().mockResolvedValue(undefined),
    select: jest.fn().mockReturnThis(),
  });
  const knex = jest.fn(mockChain);
  knex.fn = { now: jest.fn() };
  knex.raw = jest.fn(v => v);
  return knex;
});

const AchievementEngine = require("../../src/service/AchievementEngine");
const AchievementModel = require("../../src/model/application/Achievement");
const UserAchievementModel = require("../../src/model/application/UserAchievement");
const UserProgressModel = require("../../src/model/application/UserAchievementProgress");
const CategoryModel = require("../../src/model/application/AchievementCategory");
const { DefaultLogger } = require("../../src/util/Logger");

const CACHE_DATA = [
  { id: 1, key: "chat_100", type: "milestone", target_value: 100, reward_stones: 50 },
  { id: 2, key: "chat_1000", type: "milestone", target_value: 1000, reward_stones: 200 },
];

describe("AchievementEngine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Force cache refresh by mocking allWithCategories — getCache() will call it
    AchievementEngine._setCache(null);
    AchievementModel.allWithCategories.mockResolvedValue(CACHE_DATA);
  });

  describe("evaluate", () => {
    it("should skip if user already unlocked the achievement", async () => {
      UserAchievementModel.isUnlocked.mockResolvedValue(true);
      UserProgressModel.getProgress.mockResolvedValue(null);

      await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(UserAchievementModel.isUnlocked).toHaveBeenCalled();
      expect(UserProgressModel.upsert).not.toHaveBeenCalled();
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("should update progress and not unlock if below target", async () => {
      UserAchievementModel.isUnlocked.mockResolvedValue(false);
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 50 });
      UserProgressModel.upsert.mockResolvedValue();

      await AchievementEngine.evaluate("user1", "chat_message", {});

      // Should not have logged any errors
      expect(DefaultLogger.error).not.toHaveBeenCalled();
      // chat_100 progress: 50 + 1 = 51, below target of 100
      expect(UserProgressModel.upsert).toHaveBeenCalledWith("user1", 1, 51);
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("should unlock when progress reaches target", async () => {
      UserAchievementModel.isUnlocked.mockResolvedValue(false);
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 99 });
      UserProgressModel.upsert.mockResolvedValue();
      UserAchievementModel.unlock.mockResolvedValue();
      UserProgressModel.delete.mockResolvedValue();

      await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(DefaultLogger.error).not.toHaveBeenCalled();
      // chat_100: 99 + 1 = 100, equals target → unlock
      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("user1", 1);
      expect(UserProgressModel.delete).toHaveBeenCalledWith("user1", 1);
    });

    it("should not throw on event with no mapped achievements", async () => {
      await AchievementEngine.evaluate("user1", "unknown_event", {});
      expect(DefaultLogger.error).not.toHaveBeenCalled();
    });
  });

  describe("getUserSummary", () => {
    it("should return structured summary", async () => {
      AchievementModel.allWithCategories.mockResolvedValue([
        { id: 1, key: "chat_100", type: "milestone", name: "話匣子", category_key: "chat" },
        { id: 2, key: "chat_night_owl", type: "hidden", name: "夜貓子", category_key: "chat" },
      ]);
      CategoryModel.all.mockResolvedValue([{ id: 1, key: "chat", name: "聊天" }]);
      UserAchievementModel.findByUser.mockResolvedValue([
        { id: 1, key: "chat_100", name: "話匣子", unlocked_at: new Date() },
      ]);
      UserProgressModel.findByUser.mockResolvedValue([]);
      UserAchievementModel.getRecentByUser.mockResolvedValue([]);
      UserProgressModel.getNearCompletion.mockResolvedValue([]);

      const summary = await AchievementEngine.getUserSummary("user1");

      expect(summary).toHaveProperty("total", 2);
      expect(summary).toHaveProperty("unlocked", 1);
      expect(summary).toHaveProperty("percentage", 50);
      expect(summary.categories).toHaveLength(1);
      expect(summary.categories[0].achievements).toHaveLength(2);
      expect(summary).toHaveProperty("recentUnlocks");
      expect(summary).toHaveProperty("nearCompletion");
    });
  });
});
