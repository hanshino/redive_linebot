const pipeline = require("../../../src/service/chatXp/pipeline");
const PrestigeService = require("../../../src/service/PrestigeService");
const broadcastQueue = require("../../../src/util/broadcastQueue");

describe("pipeline.__onBatchWritten", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(PrestigeService, "checkTrialCompletion").mockResolvedValue({ completed: false });
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  it("does nothing when there was no active trial and no Lv.100 crossing", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 40, newLevel: 42, hadActiveTrial: false },
      "Glast"
    );
    expect(PrestigeService.checkTrialCompletion).not.toHaveBeenCalled();
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("calls checkTrialCompletion with groupId when hadActiveTrial is true", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 40, newLevel: 42, hadActiveTrial: true },
      "Glast"
    );
    expect(PrestigeService.checkTrialCompletion).toHaveBeenCalledWith("Uabc", "Glast");
  });

  it("emits lv_100_cta when batch crosses level 100", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 99, newLevel: 100, hadActiveTrial: false },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({
        type: "lv_100_cta",
        userId: "Uabc",
        text: "已達成 Lv.100，可以前往 LIFF 進行轉生",
        payload: { level: 100 },
      })
    );
  });

  it("does NOT emit lv_100_cta when prevLevel is already 100", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 100, newLevel: 100, hadActiveTrial: false },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("does NOT emit lv_100_cta when newLevel is below 100", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 98, newLevel: 99, hadActiveTrial: false },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("emits both trial pass (via checkTrialCompletion) and lv_100_cta when batch triggers both", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 99, newLevel: 100, hadActiveTrial: true },
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
      { prevLevel: 90, newLevel: 100, hadActiveTrial: false },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({ type: "lv_100_cta" })
    );
  });
});
