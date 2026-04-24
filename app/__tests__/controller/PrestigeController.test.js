// PrestigeController — unit tests invoking handlers with fake req/res.
// IMPORTANT: jest.mock calls MUST come before any require() of the mocked path
// because app jest.config has transform:{} (babel-jest disabled) so mocks are
// NOT hoisted automatically.

jest.mock("../../src/service/PrestigeService", () => ({
  getPrestigeStatus: jest.fn(),
  startTrial: jest.fn(),
  forfeitTrial: jest.fn(),
  prestige: jest.fn(),
}));

const PrestigeService = require("../../src/service/PrestigeService");
const controller = require("../../src/controller/application/PrestigeController");

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function mockReq(overrides = {}) {
  return {
    profile: { userId: "Uabc123" },
    body: {},
    ...overrides,
  };
}

describe("PrestigeController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── api.status ───────────────────────────────────────────────────────────

  describe("api.status", () => {
    it("200 — returns full status payload from service", async () => {
      const payload = {
        userId: "Uabc123",
        prestigeCount: 2,
        awakened: false,
        currentLevel: 80,
        currentExp: 5000,
        canPrestige: false,
        activeTrial: null,
        availableTrials: [],
        availableBlessings: [],
        ownedBlessings: [],
        passedTrialIds: [],
        hasUnconsumedPassedTrial: false,
      };
      PrestigeService.getPrestigeStatus.mockResolvedValue(payload);

      const req = mockReq();
      const res = mockRes();
      await controller.api.status(req, res);

      expect(PrestigeService.getPrestigeStatus).toHaveBeenCalledWith("Uabc123");
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(payload);
    });

    it("500 — when service throws an unknown error", async () => {
      PrestigeService.getPrestigeStatus.mockRejectedValue(new Error("db exploded"));

      const req = mockReq();
      const res = mockRes();
      await controller.api.status(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "UNKNOWN", message: "系統暫時無法處理，請稍後再試" })
      );
    });
  });

  // ─── api.startTrial ───────────────────────────────────────────────────────

  describe("api.startTrial", () => {
    it("200 — happy path returns service result", async () => {
      const result = { ok: true, trial: { id: 1, star: 1 }, groupId: "Cgroup" };
      PrestigeService.startTrial.mockResolvedValue(result);

      const req = mockReq({ body: { trialId: 1 } });
      const res = mockRes();
      await controller.api.startTrial(req, res);

      expect(PrestigeService.startTrial).toHaveBeenCalledWith("Uabc123", 1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it("400 ALREADY_ACTIVE — when service throws ALREADY_ACTIVE", async () => {
      const err = new Error("An active trial already exists");
      err.code = "ALREADY_ACTIVE";
      PrestigeService.startTrial.mockRejectedValue(err);

      const req = mockReq({ body: { trialId: 2 } });
      const res = mockRes();
      await controller.api.startTrial(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        code: "ALREADY_ACTIVE",
        message: "已有進行中的試煉",
      });
    });

    it("400 INVALID_BODY — missing trialId", async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      await controller.api.startTrial(req, res);

      expect(PrestigeService.startTrial).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ code: "INVALID_BODY", message: "參數格式錯誤" });
    });

    it("400 INVALID_BODY — non-integer trialId (float)", async () => {
      const req = mockReq({ body: { trialId: 1.5 } });
      const res = mockRes();
      await controller.api.startTrial(req, res);

      expect(PrestigeService.startTrial).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("400 INVALID_BODY — non-integer trialId (string)", async () => {
      const req = mockReq({ body: { trialId: "1" } });
      const res = mockRes();
      await controller.api.startTrial(req, res);

      expect(PrestigeService.startTrial).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("400 INVALID_BODY — zero trialId is rejected", async () => {
      const req = mockReq({ body: { trialId: 0 } });
      const res = mockRes();
      await controller.api.startTrial(req, res);

      expect(PrestigeService.startTrial).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("404 INVALID_TRIAL — when service throws INVALID_TRIAL", async () => {
      const err = new Error("Trial 999 does not exist");
      err.code = "INVALID_TRIAL";
      PrestigeService.startTrial.mockRejectedValue(err);

      const req = mockReq({ body: { trialId: 999 } });
      const res = mockRes();
      await controller.api.startTrial(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ code: "INVALID_TRIAL", message: "試煉不存在" });
    });
  });

  // ─── api.forfeitTrial ─────────────────────────────────────────────────────

  describe("api.forfeitTrial", () => {
    it("200 — happy path returns service result", async () => {
      const result = { ok: true, trialId: 1 };
      PrestigeService.forfeitTrial.mockResolvedValue(result);

      const req = mockReq();
      const res = mockRes();
      await controller.api.forfeitTrial(req, res);

      expect(PrestigeService.forfeitTrial).toHaveBeenCalledWith("Uabc123");
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it("400 NO_ACTIVE_TRIAL — when service throws NO_ACTIVE_TRIAL", async () => {
      const err = new Error("User has no active trial");
      err.code = "NO_ACTIVE_TRIAL";
      PrestigeService.forfeitTrial.mockRejectedValue(err);

      const req = mockReq();
      const res = mockRes();
      await controller.api.forfeitTrial(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        code: "NO_ACTIVE_TRIAL",
        message: "目前沒有進行中的試煉",
      });
    });
  });

  // ─── api.prestige ─────────────────────────────────────────────────────────

  describe("api.prestige", () => {
    it("200 — happy path returns service result", async () => {
      const result = {
        ok: true,
        newPrestigeCount: 1,
        trialId: 1,
        blessingId: 2,
        awakened: false,
        groupId: "Cgroup",
      };
      PrestigeService.prestige.mockResolvedValue(result);

      const req = mockReq({ body: { blessingId: 2 } });
      const res = mockRes();
      await controller.api.prestige(req, res);

      expect(PrestigeService.prestige).toHaveBeenCalledWith("Uabc123", 2);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it("400 NOT_LEVEL_100 — when service throws NOT_LEVEL_100", async () => {
      const err = new Error("User must be Lv.100 to prestige");
      err.code = "NOT_LEVEL_100";
      PrestigeService.prestige.mockRejectedValue(err);

      const req = mockReq({ body: { blessingId: 3 } });
      const res = mockRes();
      await controller.api.prestige(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        code: "NOT_LEVEL_100",
        message: "需先達到 Lv.100 才能轉生",
      });
    });

    it("400 INVALID_BODY — missing blessingId", async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      await controller.api.prestige(req, res);

      expect(PrestigeService.prestige).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ code: "INVALID_BODY", message: "參數格式錯誤" });
    });

    it("400 INVALID_BODY — negative blessingId is rejected", async () => {
      const req = mockReq({ body: { blessingId: -1 } });
      const res = mockRes();
      await controller.api.prestige(req, res);

      expect(PrestigeService.prestige).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("404 INVALID_BLESSING — when service throws INVALID_BLESSING", async () => {
      const err = new Error("Blessing 999 does not exist");
      err.code = "INVALID_BLESSING";
      PrestigeService.prestige.mockRejectedValue(err);

      const req = mockReq({ body: { blessingId: 999 } });
      const res = mockRes();
      await controller.api.prestige(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ code: "INVALID_BLESSING", message: "祝福不存在" });
    });

    it("400 AWAKENED — when service throws AWAKENED", async () => {
      const err = new Error("User is awakened");
      err.code = "AWAKENED";
      PrestigeService.prestige.mockRejectedValue(err);

      const req = mockReq({ body: { blessingId: 1 } });
      const res = mockRes();
      await controller.api.prestige(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        code: "AWAKENED",
        message: "已達覺醒狀態，無法再轉生",
      });
    });
  });
});
