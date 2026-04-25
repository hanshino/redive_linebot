jest.mock("fs", () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock("../../src/service/AchievementEngine", () => ({
  unlockByKey: jest.fn(),
}));

const fs = require("fs");
const mysql = require("../../src/util/mysql");
const redis = require("../../src/util/redis");
const AchievementEngine = require("../../src/service/AchievementEngine");
const main = require("../../bin/migrate-prestige-system");

function buildSchemaMock({ hasLegacy = true, hasNew = true, hasPlatformId = true, hasId = true }) {
  return {
    hasTable: jest.fn(table => {
      if (table === "chat_user_data_legacy_snapshot") return Promise.resolve(hasLegacy);
      if (table === "chat_user_data") return Promise.resolve(hasNew);
      return Promise.resolve(false);
    }),
    hasColumn: jest.fn((table, column) => {
      if (table !== "chat_user_data_legacy_snapshot") return Promise.resolve(false);
      if (column === "platform_id") return Promise.resolve(hasPlatformId);
      if (column === "id") return Promise.resolve(hasId);
      return Promise.resolve(false);
    }),
  };
}

// Routes mysql(table) calls to handlers keyed by the first arg passed.
function buildMysqlImpl(handlers) {
  return tableName => {
    const handler = handlers[tableName];
    if (!handler) {
      throw new Error(`buildMysqlImpl: no handler for table=${tableName}`);
    }
    return handler();
  };
}

describe("migrate-prestige-system", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockReset();
    AchievementEngine.unlockByKey.mockReset();
    mysql.mockReset?.();
    mysql.schema = buildSchemaMock({});
  });

  describe("pause guard", () => {
    it("aborts when CHAT_XP_PAUSED is unset", async () => {
      redis.get.mockResolvedValueOnce(null);
      await expect(main()).rejects.toThrow(/CHAT_XP_PAUSED is not set/);
    });

    it("aborts when CHAT_XP_PAUSED is '0'", async () => {
      redis.get.mockResolvedValueOnce("0");
      await expect(main()).rejects.toThrow(/CHAT_XP_PAUSED is not set/);
    });
  });

  describe("schema guard", () => {
    beforeEach(() => {
      redis.get.mockResolvedValue("1");
    });

    it("aborts when legacy snapshot is missing", async () => {
      mysql.schema = buildSchemaMock({ hasLegacy: false });
      await expect(main()).rejects.toThrow(/chat_user_data_legacy_snapshot not found/);
    });

    it("aborts when new chat_user_data is missing", async () => {
      mysql.schema = buildSchemaMock({ hasLegacy: true, hasNew: false });
      await expect(main()).rejects.toThrow(/chat_user_data not found/);
    });

    it("aborts when neither platform_id nor id column is present", async () => {
      mysql.schema = buildSchemaMock({ hasPlatformId: false, hasId: false });
      mysql.mockImplementation(
        buildMysqlImpl({
          chat_user_data_legacy_snapshot: () => ({
            count: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue({ count: 0 }) }),
          }),
        })
      );
      await expect(main()).rejects.toThrow(/cannot resolve user identity/);
    });
  });

  describe("happy path with platform_id column", () => {
    beforeEach(() => {
      redis.get.mockResolvedValue("1");
      mysql.schema = buildSchemaMock({ hasPlatformId: true });
    });

    it("seeds new chat_user_data, identifies pioneers, grants achievement", async () => {
      const allRows = [
        { user_id: "Uwhale", experience: 12000000 },
        { user_id: "Umoderate", experience: 5000 },
        { user_id: "Upioneer2", experience: 9000000 },
      ];

      const baseQuery = () => {
        const qb = {
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn(() => Promise.resolve(allRows.filter(r => r.experience > 8407860))),
          then: (resolve, reject) => Promise.resolve(allRows).then(resolve, reject),
        };
        return qb;
      };

      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        ignore: jest.fn().mockResolvedValue([3]),
      };

      mysql.mockImplementation(table => {
        if (table === "chat_user_data_legacy_snapshot") {
          return {
            count: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue({ count: 3 }),
            }),
          };
        }
        if (table === "chat_user_data_legacy_snapshot as legacy") return baseQuery();
        if (table === "chat_user_data") return insertChain;
        throw new Error(`unexpected table: ${table}`);
      });

      AchievementEngine.unlockByKey
        .mockResolvedValueOnce({ unlocked: true, achievement: { id: 1, key: "prestige_pioneer" } })
        .mockResolvedValueOnce({ unlocked: true, achievement: { id: 1, key: "prestige_pioneer" } });

      const audit = await main();

      expect(audit.snapshot_user_count).toBe(3);
      expect(audit.seeded_count).toBe(3);
      expect(audit.pioneer_count).toBe(2);
      expect(audit.achievement_unlocked).toBe(2);
      expect(audit.achievement_already_unlocked).toBe(0);
      expect(audit.achievement_errors).toBe(0);
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: "Uwhale",
            prestige_count: 0,
            current_level: 0,
            current_exp: 0,
          }),
        ])
      );
      expect(insertChain.onConflict).toHaveBeenCalledWith("user_id");
      expect(insertChain.ignore).toHaveBeenCalled();
      expect(AchievementEngine.unlockByKey).toHaveBeenNthCalledWith(
        1,
        "Uwhale",
        "prestige_pioneer"
      );
      expect(AchievementEngine.unlockByKey).toHaveBeenNthCalledWith(
        2,
        "Upioneer2",
        "prestige_pioneer"
      );
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("idempotent: second run reports already_unlocked and skips inserts via ON CONFLICT", async () => {
      const allRows = [{ user_id: "Uwhale", experience: 12000000 }];
      const baseQuery = () => ({
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn(() => Promise.resolve(allRows)),
        then: (resolve, reject) => Promise.resolve(allRows).then(resolve, reject),
      });
      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        ignore: jest.fn().mockResolvedValue([0]),
      };
      mysql.mockImplementation(table => {
        if (table === "chat_user_data_legacy_snapshot") {
          return {
            count: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue({ count: 1 }) }),
          };
        }
        if (table === "chat_user_data_legacy_snapshot as legacy") return baseQuery();
        if (table === "chat_user_data") return insertChain;
        throw new Error(`unexpected ${table}`);
      });

      AchievementEngine.unlockByKey.mockResolvedValueOnce({
        unlocked: false,
        reason: "already_unlocked",
      });

      const audit = await main();

      expect(audit.achievement_unlocked).toBe(0);
      expect(audit.achievement_already_unlocked).toBe(1);
      expect(audit.achievement_errors).toBe(0);
      expect(audit.pioneers[0].achievement_result).toBe("already_unlocked");
    });

    it("survives a single unlockByKey throw and continues with the rest", async () => {
      const allRows = [
        { user_id: "Ufail", experience: 9999999 },
        { user_id: "Uok", experience: 9000000 },
      ];
      const baseQuery = () => ({
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn(() => Promise.resolve(allRows)),
        then: (resolve, reject) => Promise.resolve(allRows).then(resolve, reject),
      });
      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        ignore: jest.fn().mockResolvedValue([2]),
      };
      mysql.mockImplementation(table => {
        if (table === "chat_user_data_legacy_snapshot") {
          return {
            count: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue({ count: 2 }) }),
          };
        }
        if (table === "chat_user_data_legacy_snapshot as legacy") return baseQuery();
        if (table === "chat_user_data") return insertChain;
        throw new Error(`unexpected ${table}`);
      });

      AchievementEngine.unlockByKey
        .mockRejectedValueOnce(new Error("DB transient"))
        .mockResolvedValueOnce({ unlocked: true, achievement: { id: 1 } });

      const audit = await main();

      expect(audit.achievement_unlocked).toBe(1);
      expect(audit.achievement_errors).toBe(1);
      expect(audit.pioneers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: "Ufail",
            achievement_result: expect.stringMatching(/^error/),
          }),
          expect.objectContaining({ user_id: "Uok", achievement_result: "unlocked" }),
        ])
      );
    });
  });

  describe("happy path with int-id fallback", () => {
    beforeEach(() => {
      redis.get.mockResolvedValue("1");
      mysql.schema = buildSchemaMock({ hasPlatformId: false, hasId: true });
    });

    it("uses JOIN strategy and resolves user_id from user table", async () => {
      const allRows = [{ user_id: "Ujoined", experience: 10000000 }];
      const baseQuery = () => ({
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn(() => Promise.resolve(allRows)),
        then: (resolve, reject) => Promise.resolve(allRows).then(resolve, reject),
      });
      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        ignore: jest.fn().mockResolvedValue([1]),
      };
      mysql.mockImplementation(table => {
        if (table === "chat_user_data_legacy_snapshot") {
          return {
            count: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue({ count: 1 }) }),
          };
        }
        if (table === "chat_user_data_legacy_snapshot as legacy") return baseQuery();
        if (table === "chat_user_data") return insertChain;
        throw new Error(`unexpected ${table}`);
      });

      AchievementEngine.unlockByKey.mockResolvedValueOnce({
        unlocked: true,
        achievement: { id: 1 },
      });

      const audit = await main();

      expect(audit.seeded_count).toBe(1);
      expect(audit.pioneer_count).toBe(1);
      expect(audit.pioneers[0].user_id).toBe("Ujoined");
    });
  });
});
