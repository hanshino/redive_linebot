jest.mock("fs", () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const mysql = require("../../src/util/mysql");
const redis = require("../../src/util/redis");
const main = require("../../bin/rollback-prestige-system");

function buildSchemaMock({ hasLegacy = true, hasNew = true } = {}) {
  return {
    hasTable: jest.fn(table => {
      if (table === "chat_user_data_legacy_snapshot") return Promise.resolve(hasLegacy);
      if (table === "chat_user_data") return Promise.resolve(hasNew);
      return Promise.resolve(false);
    }),
    dropTable: jest.fn().mockResolvedValue(undefined),
    renameTable: jest.fn().mockResolvedValue(undefined),
  };
}

describe("rollback-prestige-system", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockReset();
    mysql.mockReset?.();
    mysql.schema = buildSchemaMock();
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

    it("aborts when legacy snapshot was already dropped (T+72h passed)", async () => {
      mysql.schema = buildSchemaMock({ hasLegacy: false });
      await expect(main()).rejects.toThrow(/rollback window has likely closed/);
    });

    it("aborts when chat_user_data is missing (partially rolled back)", async () => {
      mysql.schema = buildSchemaMock({ hasLegacy: true, hasNew: false });
      await expect(main()).rejects.toThrow(/already partially rolled back/);
    });
  });

  describe("happy path", () => {
    beforeEach(() => {
      redis.get.mockResolvedValue("1");
    });

    it("drops the new table, renames legacy back, and revokes pioneer unlocks", async () => {
      const delMock = jest.fn().mockResolvedValue(82);
      mysql.mockImplementation(table => {
        if (table === "achievements") {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ id: 42 }),
          };
        }
        if (table === "user_achievements") {
          return {
            where: jest.fn().mockReturnThis(),
            del: delMock,
          };
        }
        throw new Error(`unexpected ${table}`);
      });

      const audit = await main();

      expect(mysql.schema.dropTable).toHaveBeenCalledWith("chat_user_data");
      expect(mysql.schema.renameTable).toHaveBeenCalledWith(
        "chat_user_data_legacy_snapshot",
        "chat_user_data"
      );
      expect(delMock).toHaveBeenCalledTimes(1);
      expect(audit.pioneer_achievement_id).toBe(42);
      expect(audit.revoked_count).toBe(82);
      expect(audit.schema_swapped).toBe(true);
    });

    it("aborts cleanly when prestige_pioneer achievement is missing from cache", async () => {
      mysql.mockImplementation(table => {
        if (table === "achievements") {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(undefined),
          };
        }
        throw new Error(`unexpected ${table}`);
      });

      await expect(main()).rejects.toThrow(/prestige_pioneer.*missing/);
      expect(mysql.schema.dropTable).not.toHaveBeenCalled();
    });
  });
});
