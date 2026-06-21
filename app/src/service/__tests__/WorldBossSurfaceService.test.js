jest.mock("../WorldBossBroadcastService", () => ({ buildSnapshot: jest.fn() }));
jest.mock("../WorldBossReportService", () => ({
  getUnreadReport: jest.fn(),
  markDelivered: jest.fn(),
}));

const Broadcast = require("../WorldBossBroadcastService");
const Report = require("../WorldBossReportService");
const svc = require("../WorldBossSurfaceService");

describe("WorldBossSurfaceService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("buildStatusText renders HP%/phase/board tops", async () => {
    Broadcast.buildSnapshot.mockResolvedValue({
      eventId: 9,
      hpPct: 42,
      phase: "calm",
      boards: {
        dps: [{ total_damage: 500, numericUserId: 1, platformId: "Ua" }],
        healer: [{ total_contribution: 12, numericUserId: 2, platformId: "Ub" }],
        tank: [{ total_contribution: 8, numericUserId: 3, platformId: "Uc" }],
      },
      feed: [],
    });
    const text = await svc.buildStatusText(9, "Ualice");
    expect(text).toContain("42%");
    expect(text).toContain("平穩");
    expect(text).toContain("輸出");
    expect(text).toContain("500");
  });

  it("classifyReply -> immediate for a rejected (personal) result", () => {
    expect(svc.classifyReply({ rejected: true, reason: "knocked_down" })).toEqual({
      mode: "immediate",
      reason: "knocked_down",
    });
  });

  it("classifyReply -> immediate for an enrage trigger (one-time announce)", () => {
    expect(svc.classifyReply({ rejected: false, didEnrageTrigger: true })).toEqual({
      mode: "immediate",
      reason: "enrage_trigger",
    });
  });

  it("classifyReply -> batch for an ordinary landed hit", () => {
    expect(svc.classifyReply({ rejected: false, didEnrageTrigger: false, damage: 100 })).toEqual({
      mode: "batch",
      reason: null,
    });
  });

  it("surfaceReportCard delivers the card then clears the flag", async () => {
    Report.getUnreadReport.mockResolvedValue({ hasReport: true, card: { type: "bubble" } });
    const replyFn = jest.fn().mockResolvedValue();
    const delivered = await svc.surfaceReportCard("Ualice", replyFn);
    expect(replyFn).toHaveBeenCalledWith({ type: "bubble" });
    expect(Report.markDelivered).toHaveBeenCalledWith("Ualice");
    expect(delivered).toBe(true);
  });

  it("surfaceReportCard does NOT clear the flag if reply throws", async () => {
    Report.getUnreadReport.mockResolvedValue({ hasReport: true, card: { type: "bubble" } });
    const replyFn = jest.fn().mockRejectedValue(new Error("reply failed"));
    const delivered = await svc.surfaceReportCard("Ualice", replyFn);
    expect(Report.markDelivered).not.toHaveBeenCalled();
    expect(delivered).toBe(false);
  });

  it("surfaceReportCard is a no-op when there is no unread report", async () => {
    Report.getUnreadReport.mockResolvedValue({ hasReport: false, card: null });
    const replyFn = jest.fn();
    const delivered = await svc.surfaceReportCard("Ualice", replyFn);
    expect(replyFn).not.toHaveBeenCalled();
    expect(Report.markDelivered).not.toHaveBeenCalled();
    expect(delivered).toBe(false);
  });
});
