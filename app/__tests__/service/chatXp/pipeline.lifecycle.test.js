const pipeline = require("../../../src/service/chatXp/pipeline");
const PrestigeService = require("../../../src/service/PrestigeService");
const broadcastQueue = require("../../../src/util/broadcastQueue");
const UserPrestigeTrial = require("../../../src/model/application/UserPrestigeTrial");
const UserPrestigeHistory = require("../../../src/model/application/UserPrestigeHistory");
const PrestigeTrial = require("../../../src/model/application/PrestigeTrial");

describe("pipeline.__onBatchWritten", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(PrestigeService, "checkTrialCompletion").mockResolvedValue({ completed: false });
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
    // Default: user has an unconsumed passed trial → lv_100_cta path
    jest
      .spyOn(UserPrestigeTrial, "listPassedByUserId")
      .mockResolvedValue([{ trial_id: 1, id: 10 }]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValue([]);
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValue({ display_name: "啟程" });
  });

  it("does nothing when there was no active trial and no Lv.100 crossing", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 40, newLevel: 42, hadActiveTrial: false, prestigeCount: 0 },
      "Glast"
    );
    expect(PrestigeService.checkTrialCompletion).not.toHaveBeenCalled();
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("calls checkTrialCompletion with groupId when hadActiveTrial is true", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 40, newLevel: 42, hadActiveTrial: true, prestigeCount: 0 },
      "Glast"
    );
    expect(PrestigeService.checkTrialCompletion).toHaveBeenCalledWith("Uabc", "Glast");
  });

  it("emits lv_100_cta as flex carousel when batch crosses level 100", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 99, newLevel: 100, hadActiveTrial: false, prestigeCount: 1 },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({
        type: "lv_100_cta",
        userId: "Uabc",
        flex: expect.objectContaining({
          altText: expect.stringContaining("TestUser"),
          contents: expect.objectContaining({ type: "carousel" }),
        }),
      })
    );
  });

  it("does NOT emit lv_100_cta when prevLevel is already 100", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 100, newLevel: 100, hadActiveTrial: false, prestigeCount: 0 },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("does NOT emit lv_100_cta when newLevel is below 100", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 98, newLevel: 99, hadActiveTrial: false, prestigeCount: 1 },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("emits both trial pass (via checkTrialCompletion) and lv_100_cta when batch triggers both", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 99, newLevel: 100, hadActiveTrial: true, prestigeCount: 2 },
      "Glast"
    );
    expect(PrestigeService.checkTrialCompletion).toHaveBeenCalledWith("Uabc", "Glast");
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({ type: "lv_100_cta" })
    );
  });

  it("handles big jumps (e.g. 90 → 100 after cap) as a crossing", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 90, newLevel: 100, hadActiveTrial: false, prestigeCount: 1 },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({ type: "lv_100_cta" })
    );
  });

  it("emits lv_100_no_trial_cta when user reaches Lv.100 without an unconsumed passed trial", async () => {
    UserPrestigeTrial.listPassedByUserId.mockResolvedValueOnce([]);
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 99, newLevel: 100, hadActiveTrial: false, prestigeCount: 0 },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({
        type: "lv_100_no_trial_cta",
        userId: "Uabc",
        flex: expect.objectContaining({
          altText: expect.stringContaining("尚未通過任何試煉"),
          contents: expect.objectContaining({ type: "bubble" }),
        }),
      })
    );
    const lv100Calls = broadcastQueue.pushEvent.mock.calls.filter(
      ([, ev]) => ev.type === "lv_100_cta"
    );
    expect(lv100Calls).toHaveLength(0);
  });

  it("emits lv_100_no_trial_cta when user's passed trials have all been consumed", async () => {
    UserPrestigeTrial.listPassedByUserId.mockResolvedValueOnce([{ trial_id: 1, id: 10 }]);
    UserPrestigeHistory.listByUserId.mockResolvedValueOnce([{ trial_id: 1 }]);
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 99, newLevel: 100, hadActiveTrial: false, prestigeCount: 1 },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({ type: "lv_100_no_trial_cta" })
    );
  });

  it("emits lv_50_cta with flex carousel when first-cycle user crosses Lv.50 with no active trial", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 49, newLevel: 50, hadActiveTrial: false, prestigeCount: 0 },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({
        type: "lv_50_cta",
        userId: "Uabc",
        payload: { level: 50 },
        flex: expect.objectContaining({
          altText: expect.stringContaining("TestUser"),
          contents: expect.objectContaining({ type: "carousel" }),
        }),
      })
    );
  });

  it("does NOT emit lv_50_cta when prestigeCount > 0 (post-first-cycle)", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 49, newLevel: 50, hadActiveTrial: false, prestigeCount: 1 },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("does NOT emit lv_50_cta when user already has an active trial", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 49, newLevel: 50, hadActiveTrial: true, prestigeCount: 0 },
      "Glast"
    );
    const lv50Calls = broadcastQueue.pushEvent.mock.calls.filter(
      ([, ev]) => ev.type === "lv_50_cta"
    );
    expect(lv50Calls).toHaveLength(0);
  });
});
