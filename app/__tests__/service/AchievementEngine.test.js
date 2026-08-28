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
  // unlock 回傳「這次是否真的 INSERT」；預設為 true（贏得 race）
  unlock: jest.fn().mockResolvedValue(true),
  countByUser: jest.fn(),
  getRecentByUser: jest.fn(),
  getUnlockedIds: jest.fn().mockResolvedValue(new Set()),
}));
jest.mock("../../src/model/application/UserAchievementProgress", () => ({
  getProgress: jest.fn(),
  getProgressByIds: jest.fn().mockResolvedValue(new Map()),
  upsert: jest.fn(),
  upsertMany: jest.fn().mockResolvedValue(),
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
// availableFrom 以台灣日期比對；固定「今天」才能穩定測到期前/後兩側。
jest.mock("../../src/util/date", () => ({
  todayUtc8: jest.fn(() => "2026-08-07"),
  yesterdayUtc8: jest.fn(),
  toUtc8Date: jest.fn(),
  daysAgoUtc8: jest.fn(),
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
    // clearAllMocks 會清掉 mock 的預設回傳值；unlock 現在的契約是
    // 「回傳這次是否真的 INSERT」，預設要是 true，否則所有解鎖都會被當成 race 輸家。
    UserAchievementModel.unlock.mockResolvedValue(true);
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
      expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("should update progress and not unlock if below target", async () => {
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgressByIds.mockResolvedValue(
        new Map([
          [1, 50],
          [2, 50],
        ])
      );
      UserProgressModel.upsert.mockResolvedValue();

      await AchievementEngine.evaluate("user1", "chat_message", {});

      // Should not have logged any errors
      expect(DefaultLogger.error).not.toHaveBeenCalled();
      // Progress writes are now batched into a single upsertMany call.
      // chat_100 progress: 50 + 1 = 51, below target of 100
      expect(UserProgressModel.upsertMany).toHaveBeenCalledTimes(1);
      expect(UserProgressModel.upsertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: "user1", achievementId: 1, currentValue: 51 }),
        ])
      );
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("should unlock when progress reaches target", async () => {
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgressByIds.mockResolvedValue(
        new Map([
          [1, 99],
          [2, 99],
        ])
      );
      UserProgressModel.upsert.mockResolvedValue();
      UserAchievementModel.unlock.mockResolvedValue(true);
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

    it("batches all changed achievements of one event into a single upsertMany call", async () => {
      // chat_message maps to chat_100 (id1) and chat_1000 (id2); both advance.
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgressByIds.mockResolvedValue(
        new Map([
          [1, 50],
          [2, 80],
        ])
      );

      await AchievementEngine.evaluate("user1", "chat_message", {});

      // N+1 collapse: one write for the whole pass, carrying both rows.
      expect(UserProgressModel.upsertMany).toHaveBeenCalledTimes(1);
      expect(UserProgressModel.upsertMany).toHaveBeenCalledWith([
        { userId: "user1", achievementId: 1, currentValue: 51 },
        { userId: "user1", achievementId: 2, currentValue: 81 },
      ]);
    });

    it("does not call upsertMany when no candidate value changes", async () => {
      // instant-to-target achievement already at/over target → strategy returns
      // currentValue unchanged, so nothing is collected to write.
      AchievementEngine._setCache([
        { id: 1, key: "gacha_first", type: "milestone", target_value: 1, reward_stones: 0 },
      ]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgressByIds.mockResolvedValue(new Map([[1, 1]]));

      await AchievementEngine.evaluate("user1", "gacha_pull", {});

      expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
    });

    it("still unlocks when the batched progress write fails (write/unlock isolation)", async () => {
      // chat_100 (id1) and chat_1000 (id2) both cross their target this pass.
      AchievementEngine._setCache([
        { id: 1, key: "chat_100", target_value: 100, reward_stones: 50, condition: null },
        { id: 2, key: "chat_1000", target_value: 1000, reward_stones: 200, condition: null },
      ]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgressByIds.mockResolvedValue(
        new Map([
          [1, 99],
          [2, 999],
        ])
      );
      UserProgressModel.upsertMany.mockRejectedValueOnce(new Error("deadlock"));
      UserAchievementModel.unlock.mockResolvedValue(true);
      UserProgressModel.delete.mockResolvedValue();

      const result = await AchievementEngine.evaluate("user1", "chat_message", {});

      // Batch failure is logged but does NOT abort the unlocks.
      expect(DefaultLogger.error).toHaveBeenCalledWith(
        "AchievementEngine.evaluate batch upsert error:",
        expect.any(Error)
      );
      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("user1", 1);
      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("user1", 2);
      expect(result.unlocked.map(a => a.key)).toEqual(["chat_100", "chat_1000"]);
    });

    it("isolates a failing unlock so the remaining achievements still unlock", async () => {
      AchievementEngine._setCache([
        { id: 1, key: "chat_100", target_value: 100, reward_stones: 50, condition: null },
        { id: 2, key: "chat_1000", target_value: 1000, reward_stones: 200, condition: null },
      ]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgressByIds.mockResolvedValue(
        new Map([
          [1, 99],
          [2, 999],
        ])
      );
      // First unlock (id1) blows up inside unlockAchievement; second must survive.
      UserAchievementModel.unlock.mockRejectedValueOnce(new Error("write conflict"));
      UserAchievementModel.unlock.mockResolvedValue(true);
      UserProgressModel.delete.mockResolvedValue();

      const result = await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(DefaultLogger.error).toHaveBeenCalledTimes(1);
      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("user1", 2);
      // id1 threw before its push, so only chat_1000 ends up in the result.
      expect(result.unlocked.map(a => a.key)).toEqual(["chat_1000"]);
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
      UserProgressModel.getProgressByIds.mockResolvedValue(new Map([[1, 1]]));
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
      UserProgressModel.getProgressByIds.mockResolvedValue(new Map([[2, 99]]));
      UserProgressModel.upsert.mockResolvedValue();
      UserAchievementModel.unlock.mockResolvedValue(true);
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

    it("credits reward_stones via a single INSERT row (never UPDATE across existing rows)", async () => {
      const achievement = {
        id: 2,
        key: "chat_100",
        target_value: 100,
        reward_stones: 50,
        notify_on_unlock: false,
        notify_message: null,
        condition: null,
      };
      AchievementEngine._setCache([achievement]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgressByIds.mockResolvedValue(new Map([[2, 99]]));
      UserProgressModel.upsert.mockResolvedValue();
      UserAchievementModel.unlock.mockResolvedValue(true);
      UserProgressModel.delete.mockResolvedValue();
      const insert = jest.fn().mockResolvedValue();
      const update = jest.fn().mockResolvedValue(99);
      mysql.mockImplementationOnce(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ ID: 42, itemAmount: 1000 }),
        insert,
        update,
      }));

      await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user1",
          itemId: 999,
          itemAmount: 50,
        })
      );
      expect(update).not.toHaveBeenCalled();
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

  describe("concurrent unlock (INSERT IGNORE race)", () => {
    const achievement = {
      id: 7,
      key: "chat_100",
      target_value: 100,
      reward_stones: 50,
      notify_on_unlock: true,
      notify_message: null,
      condition: null,
    };

    let insert;
    beforeEach(() => {
      AchievementEngine._setCache([achievement]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgressByIds.mockResolvedValue(new Map([[7, 99]]));
      UserProgressModel.delete.mockResolvedValue();
      insert = jest.fn().mockResolvedValue();
      mysql.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert,
      }));
    });

    afterEach(() => {
      mysql.mockImplementation(() => ({
        insert: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockResolvedValue(undefined),
        select: jest.fn().mockReturnThis(),
      }));
    });

    it("credits stones and reports the unlock when the INSERT won (affectedRows=1)", async () => {
      UserAchievementModel.unlock.mockResolvedValue(true);

      const result = await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(result.unlocked.map(a => a.id)).toEqual([7]);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user1", itemId: 999, itemAmount: 50 })
      );
    });

    it("pays nothing and reports no unlock when another pass won (affectedRows=0)", async () => {
      UserAchievementModel.unlock.mockResolvedValue(false);

      const result = await AchievementEngine.evaluate("user1", "chat_message", {});

      // 併發下的輸家：不得重複發獎，也不得再送一次解鎖通知
      expect(result.unlocked).toEqual([]);
      expect(insert).not.toHaveBeenCalled();
      expect(DefaultLogger.error).not.toHaveBeenCalled();
    });

    it("still clears the progress row for the losing pass", async () => {
      UserAchievementModel.unlock.mockResolvedValue(false);

      await AchievementEngine.evaluate("user1", "chat_message", {});

      // progress 已無意義，不論誰贏都該清掉
      expect(UserProgressModel.delete).toHaveBeenCalledWith("user1", 7);
    });

    it("unlockByKey reports already_unlocked and pays nothing when it loses the race", async () => {
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserAchievementModel.unlock.mockResolvedValue(false);

      const result = await AchievementEngine.unlockByKey("user1", "chat_100");

      expect(result).toEqual({ unlocked: false, reason: "already_unlocked" });
      expect(insert).not.toHaveBeenCalled();
    });

    it("unlockByKey pays exactly once when it wins the race", async () => {
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserAchievementModel.unlock.mockResolvedValue(true);

      const result = await AchievementEngine.unlockByKey("user1", "chat_100");

      expect(result.unlocked).toBe(true);
      expect(insert).toHaveBeenCalledTimes(1);
    });

    it("does not credit stones twice across two sequential evaluate passes", async () => {
      // 第一次贏、第二次輸（真實 INSERT IGNORE 的行為）
      UserAchievementModel.unlock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const first = await AchievementEngine.evaluate("user1", "chat_message", {});
      const second = await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(first.unlocked).toHaveLength(1);
      expect(second.unlocked).toHaveLength(0);
      expect(insert).toHaveBeenCalledTimes(1);
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
      UserAchievementModel.unlock.mockResolvedValue(true);
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

  describe("dynamic signin definitions", () => {
    // 這些成就完全由 DB row 驅動：key 不出現在 EVENT_ACHIEVEMENT_MAP、也沒有
    // 專屬 strategy。條件與門檻只存在資料庫，程式碼不洩漏。
    const makeDef = (metric, target, extra = {}) => ({
      id: 900,
      key: "a_secret_key_not_in_code",
      target_value: target,
      reward_stones: 0,
      condition: { event: "signin", metric, ...extra },
    });

    beforeEach(() => {
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgressByIds.mockResolvedValue(new Map());
      UserAchievementModel.unlock.mockResolvedValue(true);
      UserProgressModel.delete.mockResolvedValue();
      mysql.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(),
      }));
    });

    afterEach(() => {
      // 還原預設 chain，否則後面的 getUserSummary 會繼承這裡的 mysql override
      mysql.mockImplementation(() => ({
        insert: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockResolvedValue(undefined),
        select: jest.fn().mockReturnThis(),
      }));
    });

    it("tracks streak from context and unlocks at target", async () => {
      AchievementEngine._setCache([makeDef("streak", 7)]);

      const result = await AchievementEngine.evaluate("Ualice", "signin", {
        source: "normal",
        date: "2026-08-07",
        streak: 7,
        total: 20,
        monthCount: 7,
        daysInMonth: 31,
        fullMonth: false,
      });

      expect(result.unlocked.map(a => a.id)).toEqual([900]);
    });

    it("records streak progress without unlocking below target", async () => {
      AchievementEngine._setCache([makeDef("streak", 30)]);

      const result = await AchievementEngine.evaluate("Ualice", "signin", { streak: 5 });

      expect(result.unlocked).toEqual([]);
      expect(UserProgressModel.upsertMany).toHaveBeenCalledWith([
        { userId: "Ualice", achievementId: 900, currentValue: 5 },
      ]);
    });

    it("tracks total independently of streak", async () => {
      AchievementEngine._setCache([makeDef("total", 100)]);

      const result = await AchievementEngine.evaluate("Ualice", "signin", {
        streak: 1,
        total: 100,
      });

      expect(result.unlocked.map(a => a.id)).toEqual([900]);
    });

    it("full_month unlocks only when fullMonth is true", async () => {
      AchievementEngine._setCache([makeDef("full_month", 1)]);

      const miss = await AchievementEngine.evaluate("Ualice", "signin", {
        fullMonth: false,
        monthCount: 30,
        daysInMonth: 31,
      });
      expect(miss.unlocked).toEqual([]);

      const hit = await AchievementEngine.evaluate("Ualice", "signin", {
        fullMonth: true,
        monthCount: 31,
        daysInMonth: 31,
      });
      expect(hit.unlocked.map(a => a.id)).toEqual([900]);
    });

    it("treats makeup signins the same as normal ones", async () => {
      AchievementEngine._setCache([makeDef("streak", 3)]);

      const result = await AchievementEngine.evaluate("Ualice", "signin", {
        source: "makeup",
        streak: 3,
      });

      expect(result.unlocked.map(a => a.id)).toEqual([900]);
    });

    it("skips and warns on an unknown metric instead of throwing", async () => {
      AchievementEngine._setCache([makeDef("phase_of_the_moon", 1)]);

      const result = await AchievementEngine.evaluate("Ualice", "signin", { streak: 99 });

      expect(result.unlocked).toEqual([]);
      expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
      expect(DefaultLogger.warn).toHaveBeenCalledWith(expect.stringContaining("phase_of_the_moon"));
    });

    it("still honours the eligibility gate for condition-driven rows", async () => {
      AchievementEngine._setCache([
        makeDef("streak", 1, { eligibility: { excludeUserIds: ["Ualice"] } }),
      ]);

      const result = await AchievementEngine.evaluate("Ualice", "signin", { streak: 10 });

      expect(result.unlocked).toEqual([]);
      expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
    });

    it("ignores definitions whose condition.event names a different event", async () => {
      AchievementEngine._setCache([
        { ...makeDef("streak", 1), condition: { event: "janken_win", metric: "streak" } },
      ]);

      const result = await AchievementEngine.evaluate("Ualice", "signin", { streak: 10 });

      expect(result.unlocked).toEqual([]);
    });

    it("does not let a condition-driven row hijack a key that has its own strategy", async () => {
      // gacha_first 有專屬 strategy（instant，永遠回 target_value）。
      // 即使 DB row 把 condition.event 設成 signin，它也只能由 gacha_pull 觸發：
      // 否則 instant 會在簽到時無條件解鎖一個轉蛋成就。
      const hijacked = {
        id: 901,
        key: "gacha_first",
        target_value: 1,
        reward_stones: 0,
        condition: { event: "signin", metric: "streak" },
      };
      AchievementEngine._setCache([hijacked]);

      const viaSignin = await AchievementEngine.evaluate("Ualice", "signin", {
        source: "normal",
        streak: 1,
      });
      expect(viaSignin.unlocked).toEqual([]);
      expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();

      // 原本的 gacha 路徑不受影響。
      const viaGacha = await AchievementEngine.evaluate("Ualice", "gacha_pull", {});
      expect(viaGacha.unlocked.map(a => a.id)).toEqual([901]);
    });

    it("keeps a hardcoded key off a foreign event that happens to share a context field", async () => {
      // janken_streak_5 的 strategy 讀 context.streak —— 簽到 context 剛好也有 streak。
      // 這是最危險的重疊：若被誤選中，簽到連續天數會直接灌進猜拳連勝進度。
      AchievementEngine._setCache([
        {
          id: 902,
          key: "janken_streak_5",
          target_value: 5,
          reward_stones: 0,
          condition: { event: "signin", metric: "streak" },
        },
      ]);

      const result = await AchievementEngine.evaluate("Ualice", "signin", {
        source: "normal",
        streak: 9,
        total: 9,
      });

      expect(result.unlocked).toEqual([]);
      expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("still evaluates condition-driven rows whose key has no hardcoded strategy", async () => {
      // 排除規則只針對「已有 strategy 的 key」，不能誤傷正常的 DB 驅動成就。
      AchievementEngine._setCache([makeDef("streak", 3)]);

      const result = await AchievementEngine.evaluate("Ualice", "signin", { streak: 3 });

      expect(result.unlocked.map(a => a.id)).toEqual([900]);
    });

    describe("condition.month", () => {
      const fullMonthCtx = (month, fullMonth = true) => ({
        source: "normal",
        month,
        fullMonth,
        monthCount: 31,
        daysInMonth: 31,
        streak: 31,
        total: 31,
      });

      it("completes full_month when context.month matches", async () => {
        AchievementEngine._setCache([makeDef("full_month", 1, { month: "2026-08" })]);

        const result = await AchievementEngine.evaluate(
          "Ualice",
          "signin",
          fullMonthCtx("2026-08")
        );

        expect(result.unlocked.map(a => a.id)).toEqual([900]);
      });

      it("does not complete full_month when context.month differs", async () => {
        AchievementEngine._setCache([makeDef("full_month", 1, { month: "2026-08" })]);

        const result = await AchievementEngine.evaluate(
          "Ualice",
          "signin",
          fullMonthCtx("2026-09")
        );

        expect(result.unlocked).toEqual([]);
        expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
        expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
      });

      it("does not complete a month-pinned full_month when the month is not yet full", async () => {
        AchievementEngine._setCache([makeDef("full_month", 1, { month: "2026-08" })]);

        const result = await AchievementEngine.evaluate(
          "Ualice",
          "signin",
          fullMonthCtx("2026-08", false)
        );

        expect(result.unlocked).toEqual([]);
      });

      it("accepts any month when condition.month is absent", async () => {
        AchievementEngine._setCache([makeDef("full_month", 1)]);

        const result = await AchievementEngine.evaluate(
          "Ualice",
          "signin",
          fullMonthCtx("2029-12")
        );

        expect(result.unlocked.map(a => a.id)).toEqual([900]);
      });

      it("does not gate streak on condition.month", async () => {
        // streak 是累積型，綁月份沒有意義；即使 row 上帶了 month 也不該擋。
        AchievementEngine._setCache([makeDef("streak", 5, { month: "2026-01" })]);

        const result = await AchievementEngine.evaluate("Ualice", "signin", {
          month: "2026-08",
          streak: 5,
        });

        expect(result.unlocked.map(a => a.id)).toEqual([900]);
      });

      it("does not gate total on condition.month", async () => {
        AchievementEngine._setCache([makeDef("total", 10, { month: "2026-01" })]);

        const result = await AchievementEngine.evaluate("Ualice", "signin", {
          month: "2026-08",
          total: 10,
        });

        expect(result.unlocked.map(a => a.id)).toEqual([900]);
      });
    });

    describe("condition.availableFrom", () => {
      it("excludes a row whose availableFrom is still in the future", async () => {
        AchievementEngine._setCache([makeDef("streak", 1, { availableFrom: "2026-08-08" })]);

        const result = await AchievementEngine.evaluate("Ualice", "signin", { streak: 99 });

        expect(result.unlocked).toEqual([]);
        expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
        expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
      });

      it("includes a row on its availableFrom day (boundary is inclusive)", async () => {
        AchievementEngine._setCache([makeDef("streak", 1, { availableFrom: "2026-08-07" })]);

        const result = await AchievementEngine.evaluate("Ualice", "signin", { streak: 1 });

        expect(result.unlocked.map(a => a.id)).toEqual([900]);
      });

      it("includes a row whose availableFrom has passed", async () => {
        AchievementEngine._setCache([makeDef("streak", 1, { availableFrom: "2026-01-01" })]);

        const result = await AchievementEngine.evaluate("Ualice", "signin", { streak: 1 });

        expect(result.unlocked.map(a => a.id)).toEqual([900]);
      });

      it("still applies the eligibility gate alongside availableFrom", async () => {
        AchievementEngine._setCache([
          makeDef("streak", 1, {
            availableFrom: "2026-01-01",
            eligibility: { excludeUserIds: ["Ualice"] },
          }),
        ]);

        const result = await AchievementEngine.evaluate("Ualice", "signin", { streak: 9 });

        expect(result.unlocked).toEqual([]);
      });
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

    it("keeps unreleased (availableFrom) rows out of the completion denominator", async () => {
      // 今天固定為 2026-08-07。未上線的成就若算進分母，所有人的完成率會先被稀釋。
      AchievementModel.allWithCategories.mockResolvedValue([
        { id: 1, key: "live1", name: "L1", category_key: "social", condition: null },
        {
          id: 2,
          key: "live2",
          name: "L2",
          category_key: "social",
          condition: { availableFrom: "2026-08-07" },
        },
        {
          id: 3,
          key: "unreleased",
          name: "U",
          category_key: "social",
          condition: { availableFrom: "2026-09-01" },
        },
      ]);
      CategoryModel.all.mockResolvedValue([{ id: 1, key: "social", name: "社交" }]);
      UserAchievementModel.findByUser.mockResolvedValue([
        { id: 1, key: "live1", name: "L1", unlocked_at: new Date() },
      ]);
      UserProgressModel.findByUser.mockResolvedValue([]);
      UserAchievementModel.getRecentByUser.mockResolvedValue([]);
      UserProgressModel.getNearCompletion.mockResolvedValue([]);

      const summary = await AchievementEngine.getUserSummary("Ualice");

      expect(summary.total).toBe(2);
      expect(summary.percentage).toBe(50);
      expect(summary.categories[0].achievements.map(a => a.key)).toEqual(["live1", "live2"]);
    });

    describe("public projection", () => {
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
        // 以下皆為內部欄位，絕不可外流
        category_id: 9,
        condition: { event: "signin", metric: "streak", month: "2026-08" },
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

      beforeEach(() => {
        AchievementModel.allWithCategories.mockResolvedValue([SECRET_ROW]);
        CategoryModel.all.mockResolvedValue([{ id: 1, key: "signin", name: "簽到" }]);
        UserAchievementModel.findByUser.mockResolvedValue([]);
        UserProgressModel.findByUser.mockResolvedValue([]);
        UserAchievementModel.getRecentByUser.mockResolvedValue([{ ...SECRET_ROW, unlocked_at: 1 }]);
        UserProgressModel.getNearCompletion.mockResolvedValue([
          { ...SECRET_ROW, current_value: 5, percentage: 17 },
        ]);
      });

      it("strips internal fields from category achievements", async () => {
        const summary = await AchievementEngine.getUserSummary("Ualice");
        const row = summary.categories[0].achievements[0];

        PRIVATE_KEYS.forEach(k => expect(row).not.toHaveProperty(k));
      });

      it("strips internal fields from recentUnlocks and nearCompletion", async () => {
        const summary = await AchievementEngine.getUserSummary("Ualice");

        PRIVATE_KEYS.forEach(k => {
          expect(summary.recentUnlocks[0]).not.toHaveProperty(k);
          expect(summary.nearCompletion[0]).not.toHaveProperty(k);
        });
      });

      it("keeps every field the achievement UI renders", async () => {
        const summary = await AchievementEngine.getUserSummary("Ualice");
        const row = summary.categories[0].achievements[0];

        expect(row).toMatchObject({
          id: 1,
          key: "secret_key",
          name: "秘密成就",
          icon: "🗝",
          type: "hidden",
          rarity: 3,
          target_value: 30,
          reward_stones: 500,
          order: 1,
          category_key: "signin",
          category_name: "簽到",
          category_icon: "🗓",
          isUnlocked: false,
          currentValue: 0,
          unlockedAt: null,
        });
      });

      it("keeps the fields the LINE flex card reads on recent/near rows", async () => {
        const summary = await AchievementEngine.getUserSummary("Ualice");

        expect(summary.recentUnlocks[0]).toMatchObject({
          icon: "🗝",
          name: "秘密成就",
          rarity: 3,
          unlocked_at: 1,
        });
        expect(summary.nearCompletion[0]).toMatchObject({
          current_value: 5,
          target_value: 30,
          percentage: 17,
        });
      });

      it("serialises to JSON with no trace of the secret condition", async () => {
        const summary = await AchievementEngine.getUserSummary("Ualice");
        const json = JSON.stringify(summary);

        expect(json).not.toContain("condition");
        expect(json).not.toContain("notify_message");
        expect(json).not.toContain("解鎖秘密成就");
        expect(json).not.toContain("2026-08");
      });
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

    it("hides a row before its availableFrom date and keeps it after", () => {
      // 今天固定為 2026-08-07（見檔頭 util/date mock）
      expect(_isEligible("Uany", { condition: { availableFrom: "2026-08-08" } })).toBe(false);
      expect(_isEligible("Uany", { condition: { availableFrom: "2026-08-07" } })).toBe(true);
      expect(_isEligible("Uany", { condition: { availableFrom: "2026-07-01" } })).toBe(true);
    });

    it("availableFrom rejects regardless of an otherwise passing eligibility block", () => {
      const a = {
        condition: {
          availableFrom: "2026-12-01",
          eligibility: { includeUserIds: ["Uvip"] },
        },
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
      expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
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
      UserAchievementModel.unlock.mockResolvedValue(true);
      UserProgressModel.delete.mockResolvedValue();
      mysql.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(),
      }));
    });

    it("increments progress for the tagged mentionee when keywords match", async () => {
      UserProgressModel.getProgressByIds.mockResolvedValue(new Map([[60, 3]]));

      await AchievementEngine.evaluate("Uadmin", "received_mention", {
        mentionedByUserId: "Ufan",
        text: "大大鬆餅祝福你",
      });

      expect(UserProgressModel.upsertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: "Uadmin", achievementId: 60, currentValue: 4 }),
        ])
      );
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("unlocks when cumulative mentions reach target_value", async () => {
      UserProgressModel.getProgressByIds.mockResolvedValue(new Map([[60, 9]]));

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

      expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
    });

    it("does not increment when keywords are missing", async () => {
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 3 });

      await AchievementEngine.evaluate("Uadmin", "received_mention", {
        mentionedByUserId: "Ufan",
        text: "哈囉",
      });

      expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
    });

    it("does not fire for users outside includeUserIds (eligibility gate)", async () => {
      UserProgressModel.getProgress.mockResolvedValue(null);

      const result = await AchievementEngine.evaluate("Uother", "received_mention", {
        mentionedByUserId: "Ufan",
        text: "鬆餅祝福",
      });

      expect(result.unlocked).toEqual([]);
      expect(UserProgressModel.upsertMany).not.toHaveBeenCalled();
    });
  });

  describe("unlockByKey", () => {
    const PRESTIGE_CACHE = [
      {
        id: 101,
        key: "prestige_departure",
        type: "milestone",
        target_value: 1,
        reward_stones: 100,
      },
      {
        id: 102,
        key: "prestige_awakening",
        type: "milestone",
        target_value: 1,
        reward_stones: 500,
      },
    ];

    beforeEach(() => {
      AchievementEngine._setCache(PRESTIGE_CACHE);
    });

    it("unlocks and inserts stone ledger row on first call", async () => {
      UserAchievementModel.getUnlockedIds.mockResolvedValueOnce(new Set());
      UserAchievementModel.unlock.mockResolvedValueOnce(true);

      const result = await AchievementEngine.unlockByKey("Uabc", "prestige_departure");

      expect(result.unlocked).toBe(true);
      expect(result.achievement.key).toBe("prestige_departure");
      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("Uabc", 101);
      expect(mysql).toHaveBeenCalledWith("inventory");
    });

    it("is a no-op when already unlocked", async () => {
      UserAchievementModel.getUnlockedIds.mockResolvedValueOnce(new Set([101]));

      const result = await AchievementEngine.unlockByKey("Uabc", "prestige_departure");

      expect(result).toEqual({ unlocked: false, reason: "already_unlocked" });
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("logs warn and no-ops on unknown key", async () => {
      const result = await AchievementEngine.unlockByKey("Uabc", "nonexistent_key");

      expect(result).toEqual({ unlocked: false, reason: "unknown_key" });
      expect(DefaultLogger.warn).toHaveBeenCalledWith(expect.stringContaining("nonexistent_key"));
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("swallows errors from underlying unlock and returns reason:error", async () => {
      UserAchievementModel.getUnlockedIds.mockResolvedValueOnce(new Set());
      UserAchievementModel.unlock.mockRejectedValueOnce(new Error("db down"));

      const result = await AchievementEngine.unlockByKey("Uabc", "prestige_awakening");

      expect(result).toEqual({ unlocked: false, reason: "error" });
      expect(DefaultLogger.error).toHaveBeenCalled();
    });

    it("respects eligibility gate (excludeUserIds)", async () => {
      AchievementEngine._setCache([
        {
          id: 201,
          key: "restricted",
          type: "hidden",
          target_value: 1,
          reward_stones: 0,
          condition: { eligibility: { excludeUserIds: ["Uabc"] } },
        },
      ]);

      const result = await AchievementEngine.unlockByKey("Uabc", "restricted");

      expect(result).toEqual({ unlocked: false, reason: "ineligible" });
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });
  });

  describe("prestige_5 strategy", () => {
    it.each([4, 5, 6])("uses the prestige threshold for prestigeCount=%i", async prestigeCount => {
      AchievementEngine._setCache([
        {
          id: 301,
          key: "prestige_5",
          type: "hidden",
          target_value: 1,
          reward_stones: 500,
          condition: null,
        },
      ]);
      UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
      UserProgressModel.getProgressByIds.mockResolvedValue(new Map());

      const result = await AchievementEngine.evaluate("Uabc", "prestige_complete", {
        prestigeCount,
      });

      expect(result.unlocked.map(achievement => achievement.key)).toEqual(
        prestigeCount >= 5 ? ["prestige_5"] : []
      );
    });
  });

  describe("batchEvaluate (lifetime XP)", () => {
    const CHAT_CACHE = [
      { id: 1, key: "chat_100", type: "milestone", target_value: 100, reward_stones: 50 },
      { id: 2, key: "chat_1000", type: "milestone", target_value: 1000, reward_stones: 200 },
      { id: 3, key: "chat_5000", type: "milestone", target_value: 5000, reward_stones: 500 },
    ];

    // Stub the knex chain so chat_user_data query returns fake lifetime-XP rows
    // and user_achievements query returns the existing unlocks set.
    function stubMysqlChain(chatRows, existingUnlocks = []) {
      mysql.mockImplementation(table => {
        if (table === "chat_user_data") {
          return {
            select: jest.fn().mockResolvedValue(chatRows),
          };
        }
        if (table === "user_achievements") {
          return {
            whereIn: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue(existingUnlocks),
          };
        }
        if (table === "user") {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockResolvedValue([]),
          };
        }
        if (table === "inventory") {
          return { insert: jest.fn().mockResolvedValue() };
        }
        return { where: jest.fn().mockResolvedValue([]) };
      });
    }

    beforeEach(() => {
      AchievementEngine._setCache(CHAT_CACHE);
      UserAchievementModel.unlock.mockResolvedValue(true);
      UserProgressModel.upsert.mockResolvedValue();
    });

    it("uses prestige_count * ? + current_exp AS lifetime_exp via mysql.raw with LV_MAX_TOTAL_EXP binding", async () => {
      stubMysqlChain([]);
      await AchievementEngine.batchEvaluate();
      expect(mysql.raw).toHaveBeenCalledWith(
        expect.stringContaining("prestige_count * ? + current_exp"),
        [130000]
      );
    });

    it("unlocks chat_100 when lifetime_exp reaches 100 (prestige_count=0, exp=150)", async () => {
      stubMysqlChain([{ user_id: "Ualice", lifetime_exp: 150 }]);

      await AchievementEngine.batchEvaluate();

      expect(UserProgressModel.upsert).toHaveBeenCalledWith("Ualice", 1, 150);
      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("Ualice", 1);
      expect(UserAchievementModel.unlock).not.toHaveBeenCalledWith("Ualice", 2);
    });

    it("unlocks all three chat tiers for a user with banked-cycle XP (>= 5000)", async () => {
      stubMysqlChain([{ user_id: "Ubob", lifetime_exp: 130000 }]);

      await AchievementEngine.batchEvaluate();

      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("Ubob", 1);
      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("Ubob", 2);
      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("Ubob", 3);
    });

    it("unlocks chat_100+chat_1000 but not chat_5000 at mid-tier lifetime_exp", async () => {
      stubMysqlChain([{ user_id: "Umid", lifetime_exp: 2500 }]);

      await AchievementEngine.batchEvaluate();

      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("Umid", 1);
      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("Umid", 2);
      expect(UserAchievementModel.unlock).not.toHaveBeenCalledWith("Umid", 3);
    });

    it("skips already-unlocked achievements", async () => {
      stubMysqlChain(
        [{ user_id: "Ucarl", lifetime_exp: 150 }],
        [{ user_id: "Ucarl", achievement_id: 1 }]
      );

      await AchievementEngine.batchEvaluate();

      expect(UserAchievementModel.unlock).not.toHaveBeenCalledWith("Ucarl", 1);
    });
  });
});
