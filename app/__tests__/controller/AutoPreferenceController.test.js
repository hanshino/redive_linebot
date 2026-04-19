// AutoPreferenceController — unit tests invoking handlers with fake req/res.

jest.mock("../../src/model/application/UserAutoPreference", () => ({
  first: jest.fn(),
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

const UserAutoPreference = require("../../src/model/application/UserAutoPreference");
const SubscriptionService = require("../../src/service/SubscriptionService");
const GachaService = require("../../src/service/GachaService");
const GachaModel = require("../../src/model/princess/gacha");
const GachaBanner = require("../../src/model/princess/GachaBanner");
const mysql = require("../../src/util/mysql");
const controller = require("../../src/controller/application/AutoPreferenceController");

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe("AutoPreferenceController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql.first.mockResolvedValue(null);
    // Defaults for the newly-added gacha_context lookup — each test may override.
    GachaService.getRemainingDailyQuota.mockResolvedValue({ total: 2, used: 0, remaining: 2 });
    GachaModel.getUserGodStoneCount.mockResolvedValue(5000);
    GachaBanner.getActiveBannersWithCharacters.mockResolvedValue([]);
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
        entitlements: {
          auto_daily_gacha: true,
          auto_janken_fate: false,
          auto_janken_fate_with_bet: false,
        },
        gacha_context: {
          stone_balance: 5000,
          daily_quota: { total: 2, used: 0, remaining: 2 },
          costs: { normal: 0, pickup: 1500, ensure: 3000, europe: 10000 },
          europe_banner_active: false,
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
          entitlements: {
            auto_daily_gacha: false,
            auto_janken_fate: false,
            auto_janken_fate_with_bet: false,
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
      // Column order in INSERT is fixed: user_id, auto_daily_gacha, mode, janken, with_bet
      expect(sql).toMatch(/auto_daily_gacha_mode/);
      expect(args[2]).toBe("ensure");
      // COALESCE slot for mode should also carry the new value (not null)
      expect(args[6]).toBe("ensure");
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
      // COALESCE null for flags → keep existing values
      expect(args[5]).toBeNull(); // auto_daily_gacha COALESCE slot
      expect(args[7]).toBeNull(); // auto_janken_fate COALESCE slot
      expect(args[8]).toBeNull(); // auto_janken_fate_with_bet COALESCE slot
      // Mode COALESCE slot must carry the new value
      expect(args[6]).toBe("europe");
      void res;
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
