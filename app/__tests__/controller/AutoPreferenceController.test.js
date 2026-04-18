// AutoPreferenceController — unit tests invoking handlers with fake req/res.

jest.mock("../../src/model/application/UserAutoPreference", () => ({
  first: jest.fn(),
}));
jest.mock("../../src/service/SubscriptionService", () => ({
  hasEffect: jest.fn(),
}));

const UserAutoPreference = require("../../src/model/application/UserAutoPreference");
const SubscriptionService = require("../../src/service/SubscriptionService");
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
  });

  describe("GET /api/auto-preference", () => {
    it("returns 401 when profile is missing", async () => {
      const res = mockRes();
      await controller.api.getPreference({}, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "unauthenticated" });
    });

    it("returns preference + entitlement flags", async () => {
      UserAutoPreference.first.mockResolvedValue({
        user_id: "Uabc",
        auto_daily_gacha: 1,
        auto_janken_fate: 0,
      });
      SubscriptionService.hasEffect.mockImplementation(
        async (_userId, effect) => effect === "auto_daily_gacha"
      );

      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Uabc" } }, res);

      expect(res.json).toHaveBeenCalledWith({
        auto_daily_gacha: 1,
        auto_janken_fate: 0,
        auto_janken_fate_with_bet: 0,
        entitlements: {
          auto_daily_gacha: true,
          auto_janken_fate: false,
          auto_janken_fate_with_bet: false,
        },
      });
    });

    it("returns zeros + false entitlements when user has no preference row", async () => {
      UserAutoPreference.first.mockResolvedValue(null);
      SubscriptionService.hasEffect.mockResolvedValue(false);

      const res = mockRes();
      await controller.api.getPreference({ profile: { userId: "Unew" } }, res);

      expect(res.json).toHaveBeenCalledWith({
        auto_daily_gacha: 0,
        auto_janken_fate: 0,
        auto_janken_fate_with_bet: 0,
        entitlements: {
          auto_daily_gacha: false,
          auto_janken_fate: false,
          auto_janken_fate_with_bet: false,
        },
      });
    });
  });

  describe("PUT /api/auto-preference", () => {
    beforeEach(() => {
      UserAutoPreference.first.mockResolvedValue({
        user_id: "Uabc",
        auto_daily_gacha: 0,
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
      // setPreference only calls UserAutoPreference.first once — after the upsert,
      // to return the new state. So mock it as the post-upsert snapshot.
      UserAutoPreference.first.mockResolvedValue({
        user_id: "Uabc",
        auto_daily_gacha: 1,
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
    it("replies a Flex bubble with URI action pointing at /AutoSettings", async () => {
      process.env.LINE_LIFF_TALL_ID = "1234567890-abc";
      const context = { replyFlex: jest.fn().mockResolvedValue(undefined) };
      await controller.showAutoSettings(context);
      expect(context.replyFlex).toHaveBeenCalledTimes(1);
      const [altText, bubble] = context.replyFlex.mock.calls[0];
      expect(altText).toBe("自動設定");
      expect(bubble.type).toBe("bubble");
      expect(bubble.body.action.type).toBe("uri");
      expect(bubble.body.action.uri).toContain("/AutoSettings");
    });
  });
});
