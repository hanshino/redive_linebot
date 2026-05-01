const PrestigeService = require("../../src/service/PrestigeService");
const ChatUserData = require("../../src/model/application/ChatUserData");
const PrestigeTrial = require("../../src/model/application/PrestigeTrial");
const PrestigeBlessing = require("../../src/model/application/PrestigeBlessing");
const UserPrestigeTrial = require("../../src/model/application/UserPrestigeTrial");
const UserBlessing = require("../../src/model/application/UserBlessing");
const UserPrestigeHistory = require("../../src/model/application/UserPrestigeHistory");
const chatUserState = require("../../src/util/chatUserState");
const broadcastQueue = require("../../src/util/broadcastQueue");
const redis = require("../../src/util/redis");

describe("PrestigeService — full lifecycle integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  const TRIAL_DEPARTURE = {
    id: 1,
    slug: "departure",
    star: 1,
    display_name: "啟程",
    required_exp: 2000,
    duration_days: 60,
    restriction_meta: { type: "none" },
    reward_meta: { type: "trigger_achievement", achievement_slug: "prestige_departure" },
  };
  const TRIAL_HARDSHIP = {
    id: 2,
    slug: "hardship",
    star: 2,
    display_name: "刻苦",
    required_exp: 3000,
    duration_days: 60,
    restriction_meta: { type: "xp_multiplier", value: 0.7 },
    reward_meta: { type: "permanent_xp_multiplier", value: 0.1 },
  };
  const ALL_TRIALS = [
    TRIAL_DEPARTURE,
    TRIAL_HARDSHIP,
    {
      id: 3,
      slug: "rhythm",
      star: 3,
      display_name: "律動",
      required_exp: 2500,
      duration_days: 60,
      restriction_meta: { type: "cooldown_shift_multiplier", value: 1.33 },
      reward_meta: { type: "cooldown_tier_override", tiers: {} },
    },
    {
      id: 4,
      slug: "solitude",
      star: 4,
      display_name: "孤鳴",
      required_exp: 2500,
      duration_days: 60,
      restriction_meta: { type: "group_bonus_disabled" },
      reward_meta: { type: "group_bonus_double" },
    },
    {
      id: 5,
      slug: "awakening",
      star: 5,
      display_name: "覺悟",
      required_exp: 5000,
      duration_days: 60,
      restriction_meta: { type: "xp_multiplier", value: 0.5 },
      reward_meta: { type: "permanent_xp_multiplier", value: 0.15 },
    },
  ];
  const BLESSING_LANG = {
    id: 1,
    slug: "language_gift",
    display_name: "語言天賦",
    effect_meta: { type: "per_msg_xp_multiplier", value: 0.08 },
  };
  const ALL_BLESSINGS = [
    BLESSING_LANG,
    { id: 2, slug: "swift_tongue", display_name: "迅雷語速", effect_meta: {} },
    { id: 3, slug: "ember_afterglow", display_name: "燃燒餘熱", effect_meta: {} },
    { id: 4, slug: "whispering", display_name: "絮語之心", effect_meta: {} },
    { id: 5, slug: "rhythm_spring", display_name: "節律之泉", effect_meta: {} },
    { id: 6, slug: "star_guard", display_name: "群星加護", effect_meta: {} },
    { id: 7, slug: "greenhouse", display_name: "溫室之語", effect_meta: {} },
  ];

  it("fresh user → startTrial → pass → prestige → ends with one blessing and one prestige row", async () => {
    const freshUser = {
      user_id: "Uint",
      prestige_count: 0,
      current_level: 0,
      current_exp: 0,
      active_trial_id: null,
      active_trial_exp_progress: 0,
      active_trial_started_at: null,
      created_at: new Date("2026-04-01T00:00:00Z"),
    };

    jest.spyOn(PrestigeTrial, "all").mockResolvedValue(ALL_TRIALS);
    jest.spyOn(PrestigeBlessing, "all").mockResolvedValue(ALL_BLESSINGS);
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce(freshUser);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);

    let status = await PrestigeService.getPrestigeStatus("Uint");
    expect(status.prestigeCount).toBe(0);
    expect(status.canPrestige).toBe(false);
    expect(status.availableTrials).toHaveLength(5);
    expect(status.availableBlessings).toHaveLength(7);

    // After climbing to Lv.50 (the trial-unlock threshold), user can pick a trial
    ChatUserData.findByUserId.mockResolvedValueOnce({ ...freshUser, current_level: 50 });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce(TRIAL_DEPARTURE);
    UserPrestigeTrial.listPassedByUserId.mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial.model, "create").mockResolvedValueOnce(101);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValue(1);
    redis.get.mockResolvedValueOnce("Gintegration");

    const startRes = await PrestigeService.startTrial("Uint", 1);
    expect(startRes.ok).toBe(true);
    expect(startRes.trial.id).toBe(1);
    expect(broadcastQueue.pushEvent).toHaveBeenLastCalledWith(
      "Gintegration",
      expect.objectContaining({ type: "trial_enter" })
    );

    const progressedUser = {
      ...freshUser,
      active_trial_id: 1,
      active_trial_exp_progress: 2050,
      active_trial_started_at: new Date("2026-04-10T00:00:00Z"),
    };
    ChatUserData.findByUserId.mockResolvedValueOnce(progressedUser);
    PrestigeTrial.findById.mockResolvedValueOnce(TRIAL_DEPARTURE);
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 101,
      trial_id: 1,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);

    const compRes = await PrestigeService.checkTrialCompletion("Uint", "Gmsgctx");
    expect(compRes).toEqual({ completed: true, trialId: 1, trialStar: 1 });
    expect(broadcastQueue.pushEvent).toHaveBeenLastCalledWith(
      "Gmsgctx",
      expect.objectContaining({ type: "trial_pass" })
    );

    const lv100User = {
      ...freshUser,
      current_level: 100,
      current_exp: 130000,
    };
    ChatUserData.findByUserId.mockResolvedValueOnce(lv100User);
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce(BLESSING_LANG);
    UserBlessing.listBlessingIdsByUserId.mockResolvedValueOnce([]);
    UserPrestigeTrial.listPassedByUserId.mockResolvedValueOnce([
      { id: 101, trial_id: 1, ended_at: new Date("2026-04-15T00:00:00Z") },
    ]);
    UserPrestigeHistory.listByUserId.mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing.model, "create").mockResolvedValueOnce(201);
    jest.spyOn(UserPrestigeHistory.model, "create").mockResolvedValueOnce(301);
    redis.get.mockResolvedValueOnce("Gintegration");

    const prestRes = await PrestigeService.prestige("Uint", 1);
    expect(prestRes.ok).toBe(true);
    expect(prestRes.newPrestigeCount).toBe(1);
    expect(prestRes.trialId).toBe(1);
    expect(prestRes.blessingId).toBe(1);
    expect(prestRes.awakened).toBe(false);

    expect(UserPrestigeHistory.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        prestige_count_after: 1,
        trial_id: 1,
        blessing_id: 1,
        cycle_started_at: new Date("2026-04-01T00:00:00Z"),
      })
    );
    expect(broadcastQueue.pushEvent).toHaveBeenLastCalledWith(
      "Gintegration",
      expect.objectContaining({
        type: "prestige",
        text: "恭喜 TestUser 完成第 1 次轉生，選擇了祝福『語言天賦』",
      })
    );

    const postUser = {
      ...freshUser,
      prestige_count: 1,
      current_level: 0,
      current_exp: 0,
    };
    ChatUserData.findByUserId.mockResolvedValueOnce(postUser);
    UserPrestigeTrial.listPassedByUserId.mockResolvedValueOnce([{ id: 101, trial_id: 1 }]);
    UserBlessing.listBlessingIdsByUserId.mockResolvedValueOnce([1]);
    UserPrestigeHistory.listByUserId.mockResolvedValueOnce([
      { prestige_count_after: 1, trial_id: 1 },
    ]);

    status = await PrestigeService.getPrestigeStatus("Uint");
    expect(status.prestigeCount).toBe(1);
    expect(status.ownedBlessings).toEqual([1]);
    expect(status.passedTrialIds).toEqual([1]);
    expect(status.hasUnconsumedPassedTrial).toBe(false);
    expect(status.availableTrials.map(t => t.id)).toEqual([2, 3, 4, 5]);
    expect(status.availableBlessings.map(b => b.id)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(status.canPrestige).toBe(false);
  });
});
