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
  getUnlockedIds: jest.fn().mockResolvedValue(new Set()),
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
const mysql = require("../../src/util/mysql");

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
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set([1, 2]));
      UserProgressModel.getProgress.mockResolvedValue(null);

      await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(UserAchievementModel.getUnlockedIds).toHaveBeenCalled();
      expect(UserProgressModel.upsert).not.toHaveBeenCalled();
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("should update progress and not unlock if below target", async () => {
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
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
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
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

  describe("evaluate return value", () => {
    it("returns { unlocked: [] } when no achievement crosses threshold", async () => {
      AchievementEngine._setCache([
        {
          id: 1,
          key: "chat_100",
          target_value: 100,
          reward_stones: 0,
          notify_on_unlock: false,
          notify_message: null,
          condition: null,
        },
      ]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 1 });
      UserProgressModel.upsert.mockResolvedValue();

      const result = await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(result).toEqual({ unlocked: [] });
    });

    it("returns the unlocked achievement row when threshold is crossed", async () => {
      const achievement = {
        id: 2,
        key: "chat_100",
        target_value: 100,
        reward_stones: 50,
        notify_on_unlock: true,
        notify_message: null,
        condition: null,
        icon: "💬",
        name: "百句達人",
      };
      AchievementEngine._setCache([achievement]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 99 });
      UserProgressModel.upsert.mockResolvedValue();
      UserAchievementModel.unlock.mockResolvedValue();
      UserProgressModel.delete.mockResolvedValue();
      mysql.mockImplementationOnce(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(),
      }));

      const result = await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(result.unlocked).toHaveLength(1);
      expect(result.unlocked[0].key).toBe("chat_100");
    });

    it("returns { unlocked: [] } when inner error is swallowed", async () => {
      AchievementEngine._setCache([
        {
          id: 3,
          key: "chat_100",
          target_value: 100,
          reward_stones: 0,
          notify_on_unlock: false,
          notify_message: null,
          condition: null,
        },
      ]);
      UserAchievementModel.getUnlockedIds.mockRejectedValue(new Error("db down"));

      const result = await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(result).toEqual({ unlocked: [] });
    });
  });

  describe("mention_keyword event", () => {
    const baseAchievement = {
      id: 99,
      key: "mention_admin_hi",
      target_value: 1,
      reward_stones: 100,
      notify_on_unlock: true,
      notify_message: null,
      icon: "🫡",
      name: "管理員粉絲",
      condition: { mentionTargetUserIds: ["Uadmin"], keywords: ["大大好"] },
    };

    beforeEach(() => {
      AchievementEngine._setCache([baseAchievement]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgress.mockResolvedValue(null);
      UserProgressModel.upsert.mockResolvedValue();
      UserAchievementModel.unlock.mockResolvedValue();
      UserProgressModel.delete.mockResolvedValue();
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(),
      });
    });

    afterEach(() => {
      // Restore the default mysql mock chain so later describes (e.g. getUserSummary)
      // don't inherit the mention_keyword override
      mysql.mockImplementation(() => ({
        insert: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockResolvedValue(undefined),
        select: jest.fn().mockReturnThis(),
      }));
    });

    it("unlocks when all target userIds are mentioned and all keywords are present", async () => {
      const ctx = { mentionedUserIds: ["Uadmin"], text: "嗨 大大好 今天過得如何" };

      const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

      expect(result.unlocked.map(a => a.key)).toEqual(["mention_admin_hi"]);
    });

    it("does not unlock when mention is missing", async () => {
      const ctx = { mentionedUserIds: [], text: "大大好" };

      const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

      expect(result.unlocked).toEqual([]);
    });

    it("does not unlock when keyword is missing", async () => {
      const ctx = { mentionedUserIds: ["Uadmin"], text: "嗨" };

      const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

      expect(result.unlocked).toEqual([]);
    });

    it("does not unlock when condition is null", async () => {
      AchievementEngine._setCache([{ ...baseAchievement, condition: null }]);
      const ctx = { mentionedUserIds: ["Uadmin"], text: "大大好" };

      const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

      expect(result.unlocked).toEqual([]);
    });

    it("requires ALL target userIds (not just one)", async () => {
      AchievementEngine._setCache([
        {
          ...baseAchievement,
          condition: { mentionTargetUserIds: ["Uadmin", "Umod"], keywords: ["大大好"] },
        },
      ]);
      const ctx = { mentionedUserIds: ["Uadmin"], text: "大大好" };

      const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

      expect(result.unlocked).toEqual([]);
    });

    it("unlocks when keywords is empty and all target userIds are mentioned", async () => {
      AchievementEngine._setCache([
        {
          ...baseAchievement,
          condition: { mentionTargetUserIds: ["Uadmin"], keywords: [] },
        },
      ]);
      const ctx = { mentionedUserIds: ["Uadmin"], text: "隨便打什麼都行" };

      const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

      expect(result.unlocked.map(a => a.key)).toEqual(["mention_admin_hi"]);
    });

    it("does not unlock when mentionTargetUserIds is empty even if keywords is also empty", async () => {
      AchievementEngine._setCache([
        {
          ...baseAchievement,
          condition: { mentionTargetUserIds: [], keywords: [] },
        },
      ]);
      const ctx = { mentionedUserIds: ["Uadmin"], text: "隨便" };

      const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

      expect(result.unlocked).toEqual([]);
    });

    it("requires ALL keywords (not just one)", async () => {
      AchievementEngine._setCache([
        {
          ...baseAchievement,
          condition: { mentionTargetUserIds: ["Uadmin"], keywords: ["大大好", "早安"] },
        },
      ]);
      const ctx = { mentionedUserIds: ["Uadmin"], text: "大大好" };

      const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

      expect(result.unlocked).toEqual([]);
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

    it("excludes ineligible rows from total and category count", async () => {
      AchievementModel.allWithCategories.mockResolvedValue([
        { id: 1, key: "a1", name: "A1", category_key: "social", condition: null },
        {
          id: 2,
          key: "a2",
          name: "A2",
          category_key: "social",
          condition: { eligibility: { excludeUserIds: ["Uvip"] } },
        },
        {
          id: 3,
          key: "a3",
          name: "A3",
          category_key: "social",
          condition: { eligibility: { includeUserIds: ["Uvip"] } },
        },
      ]);
      CategoryModel.all.mockResolvedValue([{ id: 1, key: "social", name: "社交" }]);
      UserAchievementModel.findByUser.mockResolvedValue([]);
      UserProgressModel.findByUser.mockResolvedValue([]);
      UserAchievementModel.getRecentByUser.mockResolvedValue([]);
      UserProgressModel.getNearCompletion.mockResolvedValue([]);

      const vipSummary = await AchievementEngine.getUserSummary("Uvip");
      expect(vipSummary.total).toBe(2);
      expect(vipSummary.categories[0].total).toBe(2);
      expect(vipSummary.categories[0].achievements.map(a => a.key)).toEqual(["a1", "a3"]);

      const plebSummary = await AchievementEngine.getUserSummary("Upleb");
      expect(plebSummary.total).toBe(2);
      expect(plebSummary.categories[0].achievements.map(a => a.key)).toEqual(["a1", "a2"]);
    });
  });

  describe("isEligible", () => {
    const { _isEligible } = AchievementEngine;

    it("returns true when no eligibility block set", () => {
      expect(_isEligible("Uany", { condition: null })).toBe(true);
      expect(_isEligible("Uany", { condition: {} })).toBe(true);
    });

    it("rejects users in excludeUserIds", () => {
      const a = { condition: { eligibility: { excludeUserIds: ["Ubanned"] } } };
      expect(_isEligible("Ubanned", a)).toBe(false);
      expect(_isEligible("Uother", a)).toBe(true);
    });

    it("admits only users in includeUserIds when set", () => {
      const a = { condition: { eligibility: { includeUserIds: ["Uvip"] } } };
      expect(_isEligible("Uvip", a)).toBe(true);
      expect(_isEligible("Uother", a)).toBe(false);
    });

    it("exclude wins when user is in both", () => {
      const a = {
        condition: { eligibility: { includeUserIds: ["Uvip"], excludeUserIds: ["Uvip"] } },
      };
      expect(_isEligible("Uvip", a)).toBe(false);
    });
  });

  describe("evaluate with eligibility filter", () => {
    it("does not touch progress for excluded users", async () => {
      AchievementEngine._setCache([
        {
          id: 50,
          key: "mention_admin_hi",
          target_value: 1,
          reward_stones: 100,
          notify_on_unlock: true,
          condition: {
            mentionTargetUserIds: ["Uadmin"],
            keywords: [],
            eligibility: { excludeUserIds: ["Uadmin"] },
          },
        },
      ]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgress.mockResolvedValue(null);

      // The excluded user mentions themselves (which would otherwise pass the gate).
      const result = await AchievementEngine.evaluate("Uadmin", "mention_keyword", {
        mentionedUserIds: ["Uadmin"],
        text: "",
      });

      expect(result.unlocked).toEqual([]);
      expect(UserProgressModel.upsert).not.toHaveBeenCalled();
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });
  });

  describe("received_mention event", () => {
    const sister = {
      id: 60,
      key: "mention_admin_hi_self",
      target_value: 10,
      reward_stones: 300,
      notify_on_unlock: true,
      notify_message: null,
      icon: "🥞",
      name: "鬆餅教教主",
      condition: {
        keywords: ["鬆餅", "祝福"],
        eligibility: { includeUserIds: ["Uadmin"] },
      },
    };

    beforeEach(() => {
      AchievementEngine._setCache([sister]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.upsert.mockResolvedValue();
      UserAchievementModel.unlock.mockResolvedValue();
      UserProgressModel.delete.mockResolvedValue();
      mysql.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(),
      }));
    });

    it("increments progress for the tagged mentionee when keywords match", async () => {
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 3 });

      await AchievementEngine.evaluate("Uadmin", "received_mention", {
        mentionedByUserId: "Ufan",
        text: "大大鬆餅祝福你",
      });

      expect(UserProgressModel.upsert).toHaveBeenCalledWith("Uadmin", 60, 4);
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("unlocks when cumulative mentions reach target_value", async () => {
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 9 });

      const result = await AchievementEngine.evaluate("Uadmin", "received_mention", {
        mentionedByUserId: "Ufan",
        text: "鬆餅祝福",
      });

      expect(result.unlocked.map(a => a.key)).toEqual(["mention_admin_hi_self"]);
    });

    it("does not increment when mentioned by self (self-farming block)", async () => {
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 3 });

      await AchievementEngine.evaluate("Uadmin", "received_mention", {
        mentionedByUserId: "Uadmin",
        text: "鬆餅祝福",
      });

      expect(UserProgressModel.upsert).not.toHaveBeenCalled();
    });

    it("does not increment when keywords are missing", async () => {
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 3 });

      await AchievementEngine.evaluate("Uadmin", "received_mention", {
        mentionedByUserId: "Ufan",
        text: "哈囉",
      });

      expect(UserProgressModel.upsert).not.toHaveBeenCalled();
    });

    it("does not fire for users outside includeUserIds (eligibility gate)", async () => {
      UserProgressModel.getProgress.mockResolvedValue(null);

      const result = await AchievementEngine.evaluate("Uother", "received_mention", {
        mentionedByUserId: "Ufan",
        text: "鬆餅祝福",
      });

      expect(result.unlocked).toEqual([]);
      expect(UserProgressModel.upsert).not.toHaveBeenCalled();
    });
  });
});
