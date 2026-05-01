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

const LV50_THRESHOLD = 200860;

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

    it("seeds new chat_user_data, buckets members into tiers, grants per-tier achievements", async () => {
      const allRows = [
        { user_id: "Uwhale", experience: 12000000 }, // lv100 + lv80 + lv50
        { user_id: "Ulv80", experience: 4000000 }, // lv80 + lv50
        { user_id: "Ulv50", experience: 500000 }, // lv50 only
        { user_id: "Umoderate", experience: 5000 }, // none
      ];

      const baseQuery = () => {
        const qb = {
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn(() =>
            Promise.resolve(allRows.filter(r => r.experience >= LV50_THRESHOLD))
          ),
          then: (resolve, reject) => Promise.resolve(allRows).then(resolve, reject),
        };
        return qb;
      };

      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        ignore: jest.fn().mockResolvedValue([4]),
      };

      mysql.mockImplementation(table => {
        if (table === "chat_user_data_legacy_snapshot") {
          return {
            count: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue({ count: 4 }),
            }),
          };
        }
        if (table === "chat_user_data_legacy_snapshot as legacy") return baseQuery();
        if (table === "chat_user_data") return insertChain;
        throw new Error(`unexpected table: ${table}`);
      });

      AchievementEngine.unlockByKey.mockResolvedValue({
        unlocked: true,
        achievement: { id: 1 },
      });

      const audit = await main();

      expect(audit.snapshot_user_count).toBe(4);
      expect(audit.seeded_count).toBe(4);
      expect(audit.tier_member_count).toBe(3);
      // Uwhale → 3 grants, Ulv80 → 2, Ulv50 → 1 = 6 unlocks
      expect(audit.achievement_unlocked).toBe(6);
      expect(audit.achievement_already_unlocked).toBe(0);
      expect(audit.achievement_errors).toBe(0);
      expect(audit.by_tier.lv100.count).toBe(1);
      expect(audit.by_tier.lv80.count).toBe(2);
      expect(audit.by_tier.lv50.count).toBe(3);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: "Uwhale",
            prestige_count: 0,
            current_level: 0,
            current_exp: 0,
          }),
          expect.objectContaining({ user_id: "Umoderate" }),
        ])
      );
      expect(insertChain.onConflict).toHaveBeenCalledWith("user_id");
      expect(insertChain.ignore).toHaveBeenCalled();

      // Members iterated DESC by experience; tiers iterated in LEGACY_TIERS order
      // (lv100 → lv80 → lv50). So call sequence is:
      //   Uwhale × 3 → Ulv80 × 2 → Ulv50 × 1
      const calls = AchievementEngine.unlockByKey.mock.calls;
      expect(calls).toEqual([
        ["Uwhale", "prestige_pioneer"],
        ["Uwhale", "legacy_lv80"],
        ["Uwhale", "legacy_lv50"],
        ["Ulv80", "legacy_lv80"],
        ["Ulv80", "legacy_lv50"],
        ["Ulv50", "legacy_lv50"],
      ]);

      expect(audit.grants).toHaveLength(6);
      expect(audit.grants[0]).toEqual(
        expect.objectContaining({
          user_id: "Uwhale",
          achievement_key: "prestige_pioneer",
          tier: "lv100",
          achievement_result: "unlocked",
        })
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

      AchievementEngine.unlockByKey.mockResolvedValue({
        unlocked: false,
        reason: "already_unlocked",
      });

      const audit = await main();

      expect(audit.achievement_unlocked).toBe(0);
      expect(audit.achievement_already_unlocked).toBe(3); // Uwhale gets all 3 tier grants
      expect(audit.achievement_errors).toBe(0);
      expect(audit.grants).toHaveLength(3);
      expect(audit.grants.every(g => g.achievement_result === "already_unlocked")).toBe(true);
      expect(audit.by_tier.lv100.already_unlocked).toBe(1);
      expect(audit.by_tier.lv80.already_unlocked).toBe(1);
      expect(audit.by_tier.lv50.already_unlocked).toBe(1);
    });

    it("survives a single unlockByKey throw and continues with the rest", async () => {
      const allRows = [
        { user_id: "Ufail", experience: 9999999 }, // lv100+
        { user_id: "Uok", experience: 500000 }, // lv50 only
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

      // Ufail's first grant (prestige_pioneer) throws; the remaining 3 grants
      // (Ufail/lv80, Ufail/lv50, Uok/lv50) succeed.
      AchievementEngine.unlockByKey
        .mockRejectedValueOnce(new Error("DB transient"))
        .mockResolvedValue({ unlocked: true, achievement: { id: 1 } });

      const audit = await main();

      expect(audit.achievement_unlocked).toBe(3);
      expect(audit.achievement_errors).toBe(1);
      expect(audit.grants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: "Ufail",
            achievement_key: "prestige_pioneer",
            achievement_result: expect.stringMatching(/^error/),
          }),
          expect.objectContaining({
            user_id: "Uok",
            achievement_key: "legacy_lv50",
            achievement_result: "unlocked",
          }),
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

      AchievementEngine.unlockByKey.mockResolvedValue({
        unlocked: true,
        achievement: { id: 1 },
      });

      const audit = await main();

      expect(audit.seeded_count).toBe(1);
      expect(audit.tier_member_count).toBe(1);
      expect(audit.grants[0].user_id).toBe("Ujoined");
    });
  });
});
