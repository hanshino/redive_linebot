const pipeline = require("../../../src/service/chatXp/pipeline");
const chatUserState = require("../../../src/util/chatUserState");
const ChatUserData = require("../../../src/model/application/ChatUserData");
const ChatExpDaily = require("../../../src/model/application/ChatExpDaily");
const ChatExpEvent = require("../../../src/model/application/ChatExpEvent");
const ChatExpUnit = require("../../../src/model/application/ChatExpUnit");
const redis = require("../../../src/util/redis");
const { PRESTIGE_CAP } = require("../../../src/service/PrestigeService");
const { LV_MAX_TOTAL_EXP } = require("../../../seeds/ChatExpUnitSeeder");
const ChatWeatherService = require("../../../src/service/ChatWeatherService");
const mysql = require("../../../src/util/mysql");

// 101-row curve used for level lookups in tests
const EXP_UNIT_ROWS = Array.from({ length: 101 }, (_, i) => ({
  unit_level: i,
  total_exp: Math.round(13 * i * i),
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
    jest.spyOn(ChatWeatherService, "getWeatherForDate").mockResolvedValue(null);
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

  it.each([PRESTIGE_CAP, PRESTIGE_CAP + 1])(
    "records the crossing event time at prestige %s, not batch end or processing time",
    async prestige_count => {
      loadSpy.mockResolvedValue({ ...baseState, prestige_count: 0 }); // stale cache is not authority
      findByUserDateSpy.mockResolvedValue(null);
      findByUserIdSpy.mockResolvedValue({
        prestige_count,
        current_exp: LV_MAX_TOTAL_EXP - 150,
        current_level: 99,
        final_max_level_reached_at: null,
      });
      const times = [1700000020123, 1700000000123, 1700000010123];
      await pipeline.processBatch(
        times.map(ts => ({
          userId: "Ua",
          groupId: "Gx",
          ts,
          timeSinceLastMsg: 10000,
          groupCount: 3,
        }))
      );
      expect(upsertSpy.mock.calls[0][1]).toMatchObject({
        current_exp: LV_MAX_TOTAL_EXP,
        final_max_level_reached_at: new Date(1700000010123),
      });
      expect(mysql.transaction).toHaveBeenCalledTimes(1);
      expect(findByUserIdSpy).toHaveBeenCalledWith("Ua", mysql);
      expect(upsertSpy.mock.calls[0][2]).toBe(mysql);
    }
  );

  it.each([
    [PRESTIGE_CAP - 1, LV_MAX_TOTAL_EXP - 50, null],
    [PRESTIGE_CAP, LV_MAX_TOTAL_EXP - 1000, null],
    [PRESTIGE_CAP, LV_MAX_TOTAL_EXP, null],
    [PRESTIGE_CAP, LV_MAX_TOTAL_EXP, new Date(1600000000000)],
    [PRESTIGE_CAP, LV_MAX_TOTAL_EXP - 50, new Date(1600000000000)],
  ])(
    "does not stamp or overwrite prestige=%s exp=%s timestamp=%s",
    async (prestige_count, current_exp, final_max_level_reached_at) => {
      loadSpy.mockResolvedValue({ ...baseState, prestige_count: PRESTIGE_CAP });
      findByUserDateSpy.mockResolvedValue(null);
      findByUserIdSpy.mockResolvedValue({
        prestige_count,
        current_exp,
        current_level: 99,
        final_max_level_reached_at,
      });
      await pipeline.processBatch([
        { userId: "Ua", groupId: "Gx", ts: 1700000000123, timeSinceLastMsg: 10000, groupCount: 3 },
      ]);
      expect(upsertSpy.mock.calls[0][1]).not.toHaveProperty("final_max_level_reached_at");
    }
  );

  it("preserves the first crossing through subsequent batches", async () => {
    const row = {
      prestige_count: PRESTIGE_CAP,
      current_exp: LV_MAX_TOTAL_EXP - 50,
      current_level: 99,
      final_max_level_reached_at: null,
    };
    loadSpy.mockResolvedValue(baseState);
    findByUserDateSpy.mockResolvedValue(null);
    findByUserIdSpy.mockImplementation(async () => ({ ...row }));
    upsertSpy.mockImplementation(async (_userId, updates) => Object.assign(row, updates));
    for (const ts of [1700000000123, 1700000010123]) {
      await pipeline.processBatch([
        { userId: "Ua", groupId: "Gx", ts, timeSinceLastMsg: 10000, groupCount: 3 },
      ]);
    }
    expect(row.final_max_level_reached_at).toEqual(new Date(1700000000123));
    expect(upsertSpy.mock.calls[1][1]).not.toHaveProperty("final_max_level_reached_at");
  });

  it.each([false, true])("excludes alchemy EXP, with later protection=%s", async protectedLater => {
    loadSpy.mockResolvedValue(baseState);
    findByUserDateSpy.mockResolvedValue(null);
    findByUserIdSpy.mockResolvedValue({
      prestige_count: PRESTIGE_CAP,
      current_exp: LV_MAX_TOTAL_EXP - 50,
      current_level: 99,
      final_max_level_reached_at: null,
    });
    ChatWeatherService.getWeatherForDate.mockResolvedValue({
      weather_key: "alchemy_mist",
      category: "debuff",
      effects: { exp_to_stone_rate: 1000 },
    });
    jest
      .spyOn(ChatWeatherService, "getUserProtection")
      .mockResolvedValue(protectedLater ? { purchased_at: new Date(1700000010123) } : null);
    await pipeline.processBatch(
      [1700000000123, 1700000010123].map(ts => ({
        userId: "Ua",
        groupId: "Gx",
        ts,
        timeSinceLastMsg: 10000,
        groupCount: 3,
      }))
    );
    if (protectedLater) {
      expect(upsertSpy.mock.calls[0][1].final_max_level_reached_at).toEqual(
        new Date(1700000010123)
      );
    } else {
      expect(upsertSpy.mock.calls[0][1]).not.toHaveProperty("final_max_level_reached_at");
      expect(upsertSpy.mock.calls[0][1].current_exp).toBe(LV_MAX_TOTAL_EXP - 50);
    }
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
      expect.objectContaining({ current_exp: 6840, current_level: expect.any(Number) }),
      expect.anything()
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
      active_trial_id: 2,
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
      }),
      expect.anything()
    );
    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveExp: 63, trialId: 2 })
    );
  });

  it("caps current_exp at 130000 (Lv.100)", async () => {
    loadSpy.mockResolvedValueOnce({ ...baseState, current_level: 99, current_exp: 129950 });
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce({
      user_id: "Ua",
      current_exp: 129950,
      active_trial_exp_progress: 0,
    });

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // raw=90, effective=90, would push to 130040 but cap at 130000
    expect(upsertSpy).toHaveBeenCalledWith(
      "Ua",
      expect.objectContaining({ current_exp: 130000, current_level: 100 }),
      expect.anything()
    );
  });

  it("accumulates dailyBefore across multiple events for same user", async () => {
    loadSpy.mockResolvedValueOnce(baseState);
    findByUserDateSpy.mockResolvedValueOnce({ raw_exp: 350, effective_exp: 350 });
    findByUserIdSpy.mockResolvedValueOnce({
      user_id: "Ua",
      current_exp: 6750,
      active_trial_exp_progress: 0,
    });

    // Two events, each raw=90; dailyBefore starts at 350 (tier1 cap=400)
    // Event 1: scaled=90, scaledBefore=350, diminish: 50 at 1.0 + 40 at 0.3 = 50+12=62, effective 62
    // Event 2: scaled=90, scaledBefore=440, diminish: all at 0.3 = 27, effective 27
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

  it("persists six numeric breakdown columns per event", async () => {
    loadSpy.mockResolvedValueOnce({
      ...baseState,
      prestige_count: 0, // honeymoon active
      blessings: [1], // blessing 1 = +8% raw
      permanent_xp_multiplier: 0.05,
    });
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce(null);

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    expect(insertEventSpy).toHaveBeenCalledTimes(1);
    const payload = insertEventSpy.mock.calls[0][0];

    expect(payload).toEqual(
      expect.objectContaining({
        base_xp: 90,
        blessing1_mult: 1.08,
        honeymoon_mult: 1.2,
        trial_mult: 1,
        permanent_mult: 1.05,
      })
    );
    expect(typeof payload.diminish_factor).toBe("number");
    expect(payload.diminish_factor).toBeGreaterThan(0);
  });

  it("identity: raw_exp ≈ round(base × cooldown × group × blessing1)", async () => {
    loadSpy.mockResolvedValueOnce({ ...baseState, blessings: [1] });
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce(null);

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    const p = insertEventSpy.mock.calls[0][0];
    const expectedRaw = Math.round(p.base_xp * p.cooldown_rate * p.group_bonus * p.blessing1_mult);
    expect(p.raw_exp).toBe(expectedRaw);
  });
});
