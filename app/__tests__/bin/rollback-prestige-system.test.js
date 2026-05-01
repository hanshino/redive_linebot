jest.mock("fs", () => {
  // Partial mock — preserve real fs for unrelated callers (knex bootstrap
  // touches fs before this test runs, full replacement breaks loading).
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

const mysql = require("../../src/util/mysql");
const redis = require("../../src/util/redis");
const main = require("../../bin/rollback-prestige-system");
const {
  LEGACY_TIERS,
  SENTINEL_NOTE,
} = require("../../migrations/20260501150000_grant_legacy_tier_achievements");

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

    it("drops the new table, renames legacy back, and revokes 3-tier unlocks + sentinel inventory", async () => {
      const userAchievementsDelMock = jest.fn().mockResolvedValue(2572);
      const inventoryDelMock = jest.fn().mockResolvedValue(2572);

      mysql.mockImplementation(table => {
        if (table === "achievements") {
          return {
            whereIn: jest.fn().mockReturnThis(),
            select: jest
              .fn()
              .mockResolvedValue(LEGACY_TIERS.map((t, i) => ({ id: i + 1, key: t.key }))),
          };
        }
        if (table === "user_achievements") {
          return {
            whereIn: jest.fn().mockReturnThis(),
            del: userAchievementsDelMock,
          };
        }
        if (table === "Inventory") {
          return {
            where: jest.fn().mockReturnThis(),
            del: inventoryDelMock,
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
      expect(audit.tier_achievement_ids).toEqual([1, 2, 3]);
      expect(userAchievementsDelMock).toHaveBeenCalledTimes(1);
      expect(inventoryDelMock).toHaveBeenCalledTimes(1);
      expect(audit.revoked_count).toBe(2572);
      expect(audit.inventory_revoked_count).toBe(2572);
      expect(audit.schema_swapped).toBe(true);
    });

    it("aborts cleanly when any tier achievement is missing from cache", async () => {
      mysql.mockImplementation(table => {
        if (table === "achievements") {
          return {
            whereIn: jest.fn().mockReturnThis(),
            // Only return 2 of the 3 expected tier rows
            select: jest.fn().mockResolvedValue([
              { id: 1, key: "prestige_pioneer" },
              { id: 2, key: "legacy_lv80" },
            ]),
          };
        }
        throw new Error(`unexpected ${table}`);
      });

      await expect(main()).rejects.toThrow(/missing.*legacy_lv50/);
      expect(mysql.schema.dropTable).not.toHaveBeenCalled();
    });
  });

  describe("module exports", () => {
    it("inherits sentinel note constant from migration so audit + filter stay aligned", () => {
      expect(SENTINEL_NOTE).toMatch(/legacy-tier-migration/);
    });
  });
});
