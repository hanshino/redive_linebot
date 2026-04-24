const pipeline = require("../../../src/service/chatXp/pipeline");
const chatUserState = require("../../../src/util/chatUserState");
const ChatUserData = require("../../../src/model/application/ChatUserData");
const ChatExpDaily = require("../../../src/model/application/ChatExpDaily");
const ChatExpEvent = require("../../../src/model/application/ChatExpEvent");
const ChatExpUnit = require("../../../src/model/application/ChatExpUnit");
const redis = require("../../../src/util/redis");

// 101-row curve used for level lookups in tests
const EXP_UNIT_ROWS = Array.from({ length: 101 }, (_, i) => ({
  unit_level: i,
  total_exp: Math.round(2.7 * i * i),
}));

const baseState = {
  user_id: "Ua",
  prestige_count: 1,
  current_level: 50,
  current_exp: 6750,
  blessings: [],
  active_trial_id: null,
  active_trial_star: null,
  active_trial_started_at: null,
  active_trial_exp_progress: 0,
  permanent_xp_multiplier: 0,
  rhythm_mastery: false,
  group_bonus_double: false,
};

describe("pipeline.processBatch", () => {
  let loadSpy, findByUserIdSpy, findByUserDateSpy;
  // eslint-disable-next-line no-unused-vars
  let upsertSpy, upsertDailySpy, insertEventSpy, allExpUnitSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    loadSpy = jest.spyOn(chatUserState, "load");
    findByUserIdSpy = jest.spyOn(ChatUserData, "findByUserId");
    findByUserDateSpy = jest.spyOn(ChatExpDaily, "findByUserDate");
    upsertSpy = jest.spyOn(ChatUserData, "upsert").mockResolvedValue();
    upsertDailySpy = jest.spyOn(ChatExpDaily, "upsertByUserDate").mockResolvedValue();
    insertEventSpy = jest.spyOn(ChatExpEvent, "insertEvent").mockResolvedValue(1);
    allExpUnitSpy = jest.spyOn(ChatExpUnit, "all").mockResolvedValue(EXP_UNIT_ROWS);
    redis.get.mockImplementation(key => {
      if (key === "CHAT_GLOBAL_RATE") return Promise.resolve(null);
      return Promise.resolve(null);
    });
  });

  it("returns early for empty event list", async () => {
    await pipeline.processBatch([]);
    expect(loadSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("processes a single-user single-event batch with defaults", async () => {
    loadSpy.mockResolvedValueOnce(baseState);
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce({
      user_id: "Ua",
      current_exp: 6750,
      active_trial_exp_progress: 0,
    });

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // raw = 90 * 1 * 1 * 1 = 90; diminish: dailyBefore=0, all in tier1 -> 90; final = 90
    expect(upsertSpy).toHaveBeenCalledWith(
      "Ua",
      expect.objectContaining({ current_exp: 6840, current_level: expect.any(Number) })
    );
    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "Ua", rawExp: 90, effectiveExp: 90, msgCount: 1 })
    );
    expect(insertEventSpy).toHaveBeenCalledTimes(1);
    expect(insertEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "Ua",
        group_id: "Gx",
        raw_exp: 90,
        effective_exp: 90,
      })
    );
  });

  it("applies honeymoon x1.2 when prestige_count=0", async () => {
    loadSpy.mockResolvedValueOnce({ ...baseState, prestige_count: 0 });
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce(null);

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // raw=90; scaled=108; dailyBefore=0; all tier1 -> 108; final=108 rounded
    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ rawExp: 90, effectiveExp: 108, honeymoonActive: true })
    );
  });

  it("applies ★2 trial x0.7 multiplier", async () => {
    loadSpy.mockResolvedValueOnce({
      ...baseState,
      active_trial_id: 2,
      active_trial_star: 2,
    });
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce({
      user_id: "Ua",
      current_exp: 6750,
      active_trial_exp_progress: 500,
    });

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // raw=90; diminish=90; x0.7 = 63
    expect(upsertSpy).toHaveBeenCalledWith(
      "Ua",
      expect.objectContaining({
        current_exp: 6813, // 6750 + 63
        active_trial_exp_progress: 563,
      })
    );
    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveExp: 63, trialId: 2 })
    );
  });

  it("caps current_exp at 27000 (Lv.100)", async () => {
    loadSpy.mockResolvedValueOnce({ ...baseState, current_level: 99, current_exp: 26950 });
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce({
      user_id: "Ua",
      current_exp: 26950,
      active_trial_exp_progress: 0,
    });

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // raw=90, effective=90, would push to 27040 but cap at 27000
    expect(upsertSpy).toHaveBeenCalledWith(
      "Ua",
      expect.objectContaining({ current_exp: 27000, current_level: 100 })
    );
  });

  it("accumulates dailyBefore across multiple events for same user", async () => {
    loadSpy.mockResolvedValueOnce(baseState);
    findByUserDateSpy.mockResolvedValueOnce({ raw_exp: 150, effective_exp: 150 });
    findByUserIdSpy.mockResolvedValueOnce({
      user_id: "Ua",
      current_exp: 6750,
      active_trial_exp_progress: 0,
    });

    // Two events, each raw=90; dailyBefore starts at 150
    // Event 1: scaled=90, scaledBefore=150, diminish: 50 at 1.0 + 40 at 0.3 = 50+12=62, effective 62
    // Event 2: scaled=90, scaledBefore=240, diminish: all at 0.3 = 27, effective 27
    // Total raw 180, total effective 89
    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
      { userId: "Ua", groupId: "Gx", ts: 1700000010000, timeSinceLastMsg: 10000, groupCount: 3 },
    ]);

    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ rawExp: 180, effectiveExp: 89, msgCount: 2 })
    );
    expect(insertEventSpy).toHaveBeenCalledTimes(2);
  });

  it("processes multiple users independently", async () => {
    loadSpy.mockResolvedValueOnce(baseState).mockResolvedValueOnce({ ...baseState, user_id: "Ub" });
    findByUserDateSpy.mockResolvedValue(null);
    findByUserIdSpy.mockResolvedValue(null);

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
      { userId: "Ub", groupId: "Gx", ts: 1700000001000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(upsertDailySpy).toHaveBeenCalledTimes(2);
  });

  it("time-sorts events per user", async () => {
    loadSpy.mockResolvedValueOnce(baseState);
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce(null);

    const outOfOrder = [
      { userId: "Ua", groupId: "Gx", ts: 1700000010000, timeSinceLastMsg: 10000, groupCount: 3 },
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ];
    await pipeline.processBatch(outOfOrder);

    expect(insertEventSpy.mock.calls[0][0].ts.getTime()).toBe(1700000000000);
    expect(insertEventSpy.mock.calls[1][0].ts.getTime()).toBe(1700000010000);
  });

  it("reads CHAT_GLOBAL_RATE when present", async () => {
    redis.get.mockImplementation(key => {
      if (key === "CHAT_GLOBAL_RATE") return Promise.resolve("120");
      return Promise.resolve(null);
    });
    loadSpy.mockResolvedValueOnce(baseState);
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce(null);

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // base 120 -> raw = 120
    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ rawExp: 120, effectiveExp: 120 })
    );
  });
});
