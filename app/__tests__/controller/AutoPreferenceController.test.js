// AutoPreferenceController — unit tests invoking handlers with fake req/res.

jest.mock("../../src/model/application/UserAutoPreference", () => ({
  first: jest.fn(),
  lockByUserId: jest.fn(),
  updateByUserId: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../src/service/SubscriptionService", () => ({
  hasEffect: jest.fn(),
}));
jest.mock("../../src/service/GachaService", () => ({
  getRemainingDailyQuota: jest.fn(),
  resolveCost: jest.fn((pickup, ensure, europe, banner) => {
    if (pickup) return { amount: 1500, note: "" };
    if (ensure) return { amount: 3000, note: "" };
    if (europe) return { amount: banner && banner.cost > 0 ? banner.cost : 10000, note: "" };
    return { amount: 0, note: "" };
  }),
}));
jest.mock("../../src/model/princess/gacha", () => ({
  getUserGodStoneCount: jest.fn(),
}));
jest.mock("../../src/model/princess/GachaBanner", () => ({
  getActiveBannersWithCharacters: jest.fn(),
}));
jest.mock("../../src/service/MinigameService", () => ({
  findByUserId: jest.fn(),
}));
jest.mock("../../src/service/EquipmentService", () => ({
  getEquipmentBonuses: jest.fn(),
}));
jest.mock("../../src/service/WorldBossAttackService", () => ({
  resolveCosts: jest.fn(),
}));

const UserAutoPreference = require("../../src/model/application/UserAutoPreference");
const SubscriptionService = require("../../src/service/SubscriptionService");
const GachaService = require("../../src/service/GachaService");
const GachaModel = require("../../src/model/princess/gacha");
const GachaBanner = require("../../src/model/princess/GachaBanner");
const MinigameService = require("../../src/service/MinigameService");
const EquipmentService = require("../../src/service/EquipmentService");
const WorldBossAttackService = require("../../src/service/WorldBossAttackService");
const mysql = require("../../src/util/mysql");
const controller = require("../../src/controller/application/AutoPreferenceController");
const SubscribeUser = require("../../src/model/application/SubscribeUser");

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe("Plus-only match preferences (mocked IO, real eligibility)", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    mysql.first.mockResolvedValue({ id: 1 });
    UserAutoPreference.lockByUserId.mockResolvedValue({
      auto_match_enabled: 1,
      auto_match_bet_enabled: 1,
    });
    jest.spyOn(SubscribeUser, "lockAllByUser").mockResolvedValue([]);
    jest.spyOn(SubscribeUser, "findAllByUser").mockResolvedValue([]);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test.each(["setMatchPreference", "setMatchBetPreference"])(
    "%s gates both independent opt-ins",
    async handler => {
      for (const key of ["month", "season", "month_plus"]) {
        SubscribeUser.lockAllByUser.mockResolvedValue([
          {
            subscribe_card_key: key,
            start_at: now,
            end_at: new Date(+now + 1),
          },
        ]);
        UserAutoPreference.updateByUserId.mockClear();
        const res = mockRes();
        await controller.api[handler](
          { profile: { userId: "Uabc" }, body: { enabled: true, acknowledged: true } },
          res
        );
        if (key === "month_plus") {
          expect(res.status).not.toHaveBeenCalled();
          expect(UserAutoPreference.updateByUserId).toHaveBeenCalledTimes(1);
          expect(Object.keys(UserAutoPreference.updateByUserId.mock.calls[0][1])).toEqual(
            handler === "setMatchPreference"
              ? ["auto_match_enabled", "auto_match_generation"]
              : ["auto_match_bet_enabled", "auto_match_bet_generation"]
          );
        } else {
          expect(res.status).toHaveBeenCalledWith(403);
          expect(UserAutoPreference.updateByUserId).not.toHaveBeenCalled();
        }
      }
    }
  );

  test.each(["setMatchPreference", "setMatchBetPreference"])(
    "%s allows ineligible opt-out",
    async handler => {
      const res = mockRes();
      await controller.api[handler]({ profile: { userId: "Uabc" }, body: { enabled: false } }, res);
      expect(res.status).not.toHaveBeenCalled();
      expect(UserAutoPreference.updateByUserId).toHaveBeenCalledTimes(1);
    }
  );

  test("expired Plus retains preference but is ineffective", async () => {
    SubscribeUser.findAllByUser.mockResolvedValue([
      { subscribe_card_key: "month_plus", start_at: new Date(+now - 1), end_at: now },
    ]);
    UserAutoPreference.first.mockResolvedValue({ auto_match_enabled: 1 });
    const res = mockRes();
    await controller.api.getMatchPreference({ profile: { userId: "Uabc" } }, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, eligible: false, effective: false })
    );
  });
});

describe("AutoPreferenceController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql.first.mockResolvedValue(null);
    // Defaults for the newly-added gacha_context lookup — each test may override.
    GachaService.getRemainingDailyQuota.mockResolvedValue({ total: 2, used: 0, remaining: 2 });
    GachaModel.getUserGodStoneCount.mockResolvedValue(5000);
    GachaBanner.getActiveBannersWithCharacters.mockResolvedValue([]);
    // Defaults for the newly-added world_boss_context lookup.
    MinigameService.findByUserId.mockResolvedValue({ level: 1, job_key: "adventurer" });
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ cost_reduction: 0 });
    WorldBossAttackService.resolveCosts.mockReturnValue({
      standardCost: 10,
      skillCost: 8,
      skillName: "奮力揮擊",
    });
  });

  describe("GET /api/auto-preference", () => {
    it("returns 401 when profile is missing", async () => {
      const res = mockRes();
      await controller.api.getPreference({}, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "unauthenticated" });
    });

    it("returns preference + entitlement flags + gacha_context", async () => {
      UserAutoPreference.first.mockResolvedValue({
        user_id: "Uabc",
        auto_daily_gacha: 1,
        auto_daily_gacha_mode: "ensure",
        auto_janken_fate: 0,
      });
      SubscriptionService.hasEffect.mockImplementation(
        async (_userId, effect) => effect === "auto_daily_gacha"
      );

      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Uabc" } }, res);

      expect(res.json).toHaveBeenCalledWith({
        auto_daily_gacha: 1,
        auto_daily_gacha_mode: "ensure",
        auto_janken_fate: 0,
        auto_janken_fate_with_bet: 0,
        auto_world_boss: 1,
        auto_world_boss_mode: "standard",
        entitlements: {
          auto_daily_gacha: true,
          auto_janken_fate: false,
          auto_janken_fate_with_bet: false,
          auto_world_boss: false,
        },
        gacha_context: {
          stone_balance: 5000,
          daily_quota: { total: 2, used: 0, remaining: 2 },
          costs: { normal: 0, pickup: 1500, ensure: 3000, europe: 10000 },
          europe_banner_active: false,
        },
        world_boss_context: {
          daily_cost_limit: 100,
          standard_cost: 10,
          skill_cost: 8,
          skill_name: "奮力揮擊",
        },
      });
    });

    it("returns zeros + mode='normal' + false entitlements when user has no preference row", async () => {
      UserAutoPreference.first.mockResolvedValue(null);
      SubscriptionService.hasEffect.mockResolvedValue(false);

      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Unew" } }, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auto_daily_gacha: 0,
          auto_daily_gacha_mode: "normal",
          auto_janken_fate: 0,
          auto_janken_fate_with_bet: 0,
          auto_world_boss: 1,
          auto_world_boss_mode: "standard",
          entitlements: {
            auto_daily_gacha: false,
            auto_janken_fate: false,
            auto_janken_fate_with_bet: false,
            auto_world_boss: false,
          },
        })
      );
    });

    it("reports europe_banner_active=true and uses banner.cost when active europe banner has cost > 0", async () => {
      UserAutoPreference.first.mockResolvedValue(null);
      SubscriptionService.hasEffect.mockResolvedValue(false);
      GachaBanner.getActiveBannersWithCharacters.mockResolvedValue([
        { id: 1, type: "europe", cost: 7777, characterIds: [] },
      ]);

      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Uabc" } }, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.gacha_context.europe_banner_active).toBe(true);
      expect(payload.gacha_context.costs.europe).toBe(7777);
    });

    it("falls back to config europe_cost when banner cost is 0/missing", async () => {
      UserAutoPreference.first.mockResolvedValue(null);
      SubscriptionService.hasEffect.mockResolvedValue(false);
      GachaBanner.getActiveBannersWithCharacters.mockResolvedValue([
        { id: 1, type: "europe", cost: 0, characterIds: [] },
      ]);

      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Uabc" } }, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.gacha_context.europe_banner_active).toBe(true);
      expect(payload.gacha_context.costs.europe).toBe(10000);
    });

    it("coerces invalid stored mode value back to 'normal'", async () => {
      UserAutoPreference.first.mockResolvedValue({
        user_id: "Uabc",
        auto_daily_gacha: 1,
        auto_daily_gacha_mode: "garbage",
        auto_janken_fate: 0,
      });
      SubscriptionService.hasEffect.mockResolvedValue(true);

      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Uabc" } }, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.auto_daily_gacha_mode).toBe("normal");
    });
  });

  describe("PUT /api/auto-preference", () => {
    beforeEach(() => {
      UserAutoPreference.first.mockResolvedValue({
        user_id: "Uabc",
        auto_daily_gacha: 0,
        auto_daily_gacha_mode: "normal",
        auto_janken_fate: 0,
      });
    });

    it("rejects flipping a flag to 1 without entitlement (returns 403)", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(false);
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_daily_gacha: 1 } },
        res
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "entitlement_missing",
        field: "auto_daily_gacha",
      });
      expect(mysql.raw).not.toHaveBeenCalled();
    });

    it("flipping to 0 is always allowed (opt-out no entitlement required)", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(false);
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_daily_gacha: 0 } },
        res
      );
      expect(mysql.raw).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it("happy path: entitled + flag=1 → UPSERT with body args, token userId used", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(true);
      UserAutoPreference.first.mockResolvedValue({
        user_id: "Uabc",
        auto_daily_gacha: 1,
        auto_daily_gacha_mode: "normal",
        auto_janken_fate: 0,
      });
      const res = mockRes();
      await controller.api.setPreference(
        {
          profile: { userId: "Uabc" },
          body: { auto_daily_gacha: 1, user_id: "Udifferent" }, // body user_id ignored
        },
        res
      );
      expect(mysql.raw).toHaveBeenCalledTimes(1);
      const [sql, args] = mysql.raw.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO user_auto_preference/);
      expect(args[0]).toBe("Uabc"); // NOT "Udifferent"
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ auto_daily_gacha: 1, auto_janken_fate: 0 })
      );
    });

    it("empty body returns current preference without UPSERT", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(true);
      const res = mockRes();
      await controller.api.setPreference({ profile: { userId: "Uabc" }, body: {} }, res);
      expect(mysql.raw).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });

    it("accepts valid auto_daily_gacha_mode and persists it via UPSERT", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(true);
      UserAutoPreference.first.mockResolvedValue({
        user_id: "Uabc",
        auto_daily_gacha: 0,
        auto_daily_gacha_mode: "ensure",
        auto_janken_fate: 0,
      });
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_daily_gacha_mode: "ensure" } },
        res
      );
      expect(mysql.raw).toHaveBeenCalledTimes(1);
      const [sql, args] = mysql.raw.mock.calls[0];
      // Column order in INSERT is fixed: user_id, auto_daily_gacha, mode, janken, with_bet,
      // auto_world_boss, auto_world_boss_mode.
      expect(sql).toMatch(/auto_daily_gacha_mode/);
      expect(args[2]).toBe("ensure");
      // COALESCE slot for mode should also carry the new value (not null)
      expect(args[8]).toBe("ensure");
      const payload = res.json.mock.calls[0][0];
      expect(payload.auto_daily_gacha_mode).toBe("ensure");
    });

    it("rejects unknown mode with 400 invalid_mode", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(true);
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_daily_gacha_mode: "legendary" } },
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "invalid_mode",
        field: "auto_daily_gacha_mode",
      });
      expect(mysql.raw).not.toHaveBeenCalled();
    });

    it("mode change does NOT require auto_daily_gacha entitlement (toggle gate already covers it)", async () => {
      // User dropped their subscription but still sends a mode change while the toggle is 0.
      SubscriptionService.hasEffect.mockResolvedValue(false);
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_daily_gacha_mode: "pickup" } },
        res
      );
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(mysql.raw).toHaveBeenCalledTimes(1);
    });

    it("sending only mode (no flags) still triggers UPSERT and keeps other flags via COALESCE null", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(true);
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_daily_gacha_mode: "europe" } },
        res
      );
      const args = mysql.raw.mock.calls[0][1];
      // COALESCE null for flags → keep existing values. Column order:
      // [0]user_id [1]gacha [2]mode [3]janken [4]with_bet [5]world_boss [6]world_boss_mode
      // [7]COALESCE(gacha) [8]COALESCE(mode) [9]COALESCE(janken) [10]COALESCE(with_bet)
      // [11]COALESCE(world_boss) [12]COALESCE(world_boss_mode)
      expect(args[7]).toBeNull(); // auto_daily_gacha COALESCE slot
      expect(args[9]).toBeNull(); // auto_janken_fate COALESCE slot
      expect(args[10]).toBeNull(); // auto_janken_fate_with_bet COALESCE slot
      expect(args[11]).toBeNull(); // auto_world_boss COALESCE slot
      expect(args[12]).toBeNull(); // auto_world_boss_mode COALESCE slot
      // Mode COALESCE slot must carry the new value
      expect(args[8]).toBe("europe");
      void res;
    });
  });

  describe("auto_world_boss（Plus 專屬，預設開啟）", () => {
    it("no preference row at all → auto_world_boss defaults to 1, mode defaults to standard", async () => {
      UserAutoPreference.first.mockResolvedValue(null);
      SubscriptionService.hasEffect.mockResolvedValue(false);
      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Ufresh" } }, res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.auto_world_boss).toBe(1);
      expect(payload.auto_world_boss_mode).toBe("standard");
    });

    it("a pre-existing row from before this feature (auto_world_boss undefined) also defaults to 1", async () => {
      // Simulates a row inserted before the migration's DEFAULT took effect on this column
      // in application code — the row exists but the field is missing/undefined, not 0.
      UserAutoPreference.first.mockResolvedValue({
        user_id: "Uold",
        auto_daily_gacha: 0,
        auto_daily_gacha_mode: "normal",
        auto_janken_fate: 0,
        auto_janken_fate_with_bet: 0,
      });
      SubscriptionService.hasEffect.mockResolvedValue(false);
      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Uold" } }, res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.auto_world_boss).toBe(1);
    });

    it("only an explicit auto_world_boss=0 row is reported as disabled", async () => {
      UserAutoPreference.first.mockResolvedValue({
        user_id: "Uoff",
        auto_world_boss: 0,
        auto_world_boss_mode: "skill",
      });
      SubscriptionService.hasEffect.mockResolvedValue(true);
      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Uoff" } }, res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.auto_world_boss).toBe(0);
      expect(payload.auto_world_boss_mode).toBe("skill");
    });

    it("entitlements.auto_world_boss reflects SubscriptionService.hasEffect('auto_world_boss')", async () => {
      SubscriptionService.hasEffect.mockImplementation(
        async (_userId, effect) => effect === "auto_world_boss"
      );
      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Uabc" } }, res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.entitlements.auto_world_boss).toBe(true);
      expect(payload.entitlements.auto_daily_gacha).toBe(false);
    });

    it("world_boss_context surfaces per-user standard/skill cost from WorldBossAttackService.resolveCosts", async () => {
      MinigameService.findByUserId.mockResolvedValue({ level: 8, job_key: "swordman" });
      EquipmentService.getEquipmentBonuses.mockResolvedValue({ cost_reduction: 3 });
      WorldBossAttackService.resolveCosts.mockReturnValue({
        standardCost: 7,
        skillCost: 7,
        skillName: "震地斬擊",
      });

      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Uabc" } }, res);

      expect(WorldBossAttackService.resolveCosts).toHaveBeenCalledWith(
        { level: 8, job_key: "swordman" },
        { cost_reduction: 3 }
      );
      const payload = res.json.mock.calls[0][0];
      expect(payload.world_boss_context).toEqual({
        daily_cost_limit: 100,
        standard_cost: 7,
        skill_cost: 7,
        skill_name: "震地斬擊",
      });
    });

    it("world_boss_context degrades to null (not a thrown error) when the lookup fails", async () => {
      MinigameService.findByUserId.mockRejectedValue(new Error("db down"));
      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Uabc" } }, res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.world_boss_context).toBeNull();
      expect(res.status).not.toHaveBeenCalledWith(500);
    });

    it("setPreference rejects auto_world_boss=1 without entitlement (403 entitlement_missing)", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(false);
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_world_boss: 1 } },
        res
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "entitlement_missing",
        field: "auto_world_boss",
      });
      expect(mysql.raw).not.toHaveBeenCalled();
    });

    it("setPreference allows turning auto_world_boss off without entitlement", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(false);
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_world_boss: 0 } },
        res
      );
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(mysql.raw).toHaveBeenCalledTimes(1);
    });

    it("setPreference accepts auto_world_boss_mode='skill' and persists it", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(true);
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_world_boss_mode: "skill" } },
        res
      );
      expect(mysql.raw).toHaveBeenCalledTimes(1);
      const args = mysql.raw.mock.calls[0][1];
      expect(args[6]).toBe("skill"); // VALUES slot for auto_world_boss_mode
      expect(args[12]).toBe("skill"); // COALESCE slot for auto_world_boss_mode
    });

    it("setPreference rejects an unknown auto_world_boss_mode with 400 invalid_mode", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(true);
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_world_boss_mode: "ultimate" } },
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "invalid_mode",
        field: "auto_world_boss_mode",
      });
      expect(mysql.raw).not.toHaveBeenCalled();
    });

    it("new row created via UPSERT defaults auto_world_boss=1 / mode='standard' when unspecified", async () => {
      SubscriptionService.hasEffect.mockResolvedValue(true);
      const res = mockRes();
      await controller.api.setPreference(
        { profile: { userId: "Uabc" }, body: { auto_daily_gacha: 1 } },
        res
      );
      const args = mysql.raw.mock.calls[0][1];
      expect(args[5]).toBe(1); // VALUES slot for auto_world_boss
      expect(args[6]).toBe("standard"); // VALUES slot for auto_world_boss_mode
    });
  });

  describe("GET /api/auto-history", () => {
    it("returns 401 when profile is missing", async () => {
      const res = mockRes();
      await controller.api.getHistory({ query: {} }, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("caps limit at 100 even when query.limit is 500", async () => {
      const res = mockRes();
      await controller.api.getHistory(
        { profile: { userId: "Uabc" }, query: { limit: "500", type: "gacha" } },
        res
      );
      expect(mysql.limit).toHaveBeenCalledWith(100);
    });

    it("defaults to limit=30 when query.limit is missing", async () => {
      const res = mockRes();
      await controller.api.getHistory(
        { profile: { userId: "Uabc" }, query: { type: "gacha" } },
        res
      );
      expect(mysql.limit).toHaveBeenCalledWith(30);
    });

    it("type=gacha queries only auto_gacha_job_log", async () => {
      const res = mockRes();
      await controller.api.getHistory(
        { profile: { userId: "Uabc" }, query: { type: "gacha" } },
        res
      );
      // mysql() call argument should be the gacha table, not janken
      const calls = mysql.mock.calls.map(c => c[0]);
      expect(calls).toContain("auto_gacha_job_log");
      expect(calls).not.toContain("janken_auto_fate_log");
    });

    it("type=janken queries only janken_auto_fate_log", async () => {
      const res = mockRes();
      await controller.api.getHistory(
        { profile: { userId: "Uabc" }, query: { type: "janken" } },
        res
      );
      const calls = mysql.mock.calls.map(c => c[0]);
      expect(calls).toContain("janken_auto_fate_log");
      expect(calls).not.toContain("auto_gacha_job_log");
    });
  });

  describe("showAutoSettings (LINE command)", () => {
    it("replies a Flex bubble with URI action pointing at /auto/settings", async () => {
      process.env.LINE_LIFF_TALL_ID = "1234567890-abc";
      const context = { replyFlex: jest.fn().mockResolvedValue(undefined) };
      await controller.showAutoSettings(context);
      expect(context.replyFlex).toHaveBeenCalledTimes(1);
      const [altText, bubble] = context.replyFlex.mock.calls[0];
      expect(altText).toBe("自動設定");
      expect(bubble.type).toBe("bubble");
      expect(bubble.body.action.type).toBe("uri");
      expect(bubble.body.action.uri).toContain("/auto/settings");
    });
  });
});
