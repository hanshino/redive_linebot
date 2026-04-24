const PrestigeService = require("../../src/service/PrestigeService");
const ChatUserData = require("../../src/model/application/ChatUserData");
const PrestigeTrial = require("../../src/model/application/PrestigeTrial");
const UserPrestigeTrial = require("../../src/model/application/UserPrestigeTrial");
const chatUserState = require("../../src/util/chatUserState");
const broadcastQueue = require("../../src/util/broadcastQueue");
const redis = require("../../src/util/redis");

describe("PrestigeService.startTrial", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  it("inserts user_prestige_trials row + updates chat_user_data + invalidates state + emits trial_enter", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      current_level: 50,
      active_trial_id: null,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
      duration_days: 60,
    });
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial.model, "create").mockResolvedValueOnce(42);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);
    redis.get.mockResolvedValueOnce("Glast");

    const result = await PrestigeService.startTrial("Uabc", 1);

    expect(UserPrestigeTrial.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "Uabc",
        trial_id: 1,
        status: "active",
        final_exp_progress: 0,
      })
    );
    const upsertArgs = ChatUserData.upsert.mock.calls[0];
    expect(upsertArgs[0]).toBe("Uabc");
    expect(upsertArgs[1].active_trial_id).toBe(1);
    expect(upsertArgs[1].active_trial_exp_progress).toBe(0);
    expect(upsertArgs[1].active_trial_started_at).toBeInstanceOf(Date);

    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uabc");

    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({
        type: "trial_enter",
        userId: "Uabc",
        text: "踏入了 ★1 的試煉",
        payload: { trialId: 1, trialStar: 1, trialSlug: "departure" },
      })
    );

    expect(result.ok).toBe(true);
    expect(result.trial.id).toBe(1);
    expect(result.groupId).toBe("Glast");
  });

  it("emits broadcast with null groupId when CHAT_USER_LAST_GROUP is not cached", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      active_trial_id: null,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
    });
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);
    redis.get.mockResolvedValueOnce(null);

    const result = await PrestigeService.startTrial("Uabc", 1);

    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(null, expect.any(Object));
    expect(result.groupId).toBeNull();
  });

  it("throws AWAKENED when prestige_count >= 5", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 5,
      active_trial_id: null,
    });

    await expect(PrestigeService.startTrial("Uabc", 1)).rejects.toMatchObject({
      code: "AWAKENED",
    });
  });

  it("throws AWAKENED when chat_user_data row is missing", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce(null);

    await expect(PrestigeService.startTrial("Uabc", 1)).rejects.toMatchObject({
      code: "AWAKENED",
    });
  });

  it("throws INVALID_TRIAL when trialId is not in prestige_trials", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      active_trial_id: null,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce(null);

    await expect(PrestigeService.startTrial("Uabc", 99)).rejects.toMatchObject({
      code: "INVALID_TRIAL",
    });
  });

  it("throws ALREADY_ACTIVE when chat_user_data.active_trial_id is set", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      active_trial_id: 2,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
    });

    await expect(PrestigeService.startTrial("Uabc", 1)).rejects.toMatchObject({
      code: "ALREADY_ACTIVE",
    });
  });

  it("throws ALREADY_PASSED when user already passed this trial", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      active_trial_id: null,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
    });
    jest
      .spyOn(UserPrestigeTrial, "listPassedByUserId")
      .mockResolvedValueOnce([{ id: 10, trial_id: 1, status: "passed" }]);

    await expect(PrestigeService.startTrial("Uabc", 1)).rejects.toMatchObject({
      code: "ALREADY_PASSED",
    });
  });
});

describe("PrestigeService.forfeitTrial", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  it("marks row forfeited, clears chat_user_data, invalidates state, no broadcast", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 2,
      active_trial_exp_progress: 1200,
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 42,
      user_id: "Uabc",
      trial_id: 2,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    const result = await PrestigeService.forfeitTrial("Uabc");

    expect(UserPrestigeTrial.model.update).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        status: "forfeited",
        final_exp_progress: 1200,
      })
    );
    const updateArgs = UserPrestigeTrial.model.update.mock.calls[0][1];
    expect(updateArgs.ended_at).toBeInstanceOf(Date);

    const upsertArgs = ChatUserData.upsert.mock.calls[0];
    expect(upsertArgs[0]).toBe("Uabc");
    expect(upsertArgs[1]).toEqual({
      active_trial_id: null,
      active_trial_started_at: null,
      active_trial_exp_progress: 0,
    });

    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uabc");
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();

    expect(result).toEqual({ ok: true, trialId: 2 });
  });

  it("throws NO_ACTIVE_TRIAL when active_trial_id is null", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: null,
    });

    await expect(PrestigeService.forfeitTrial("Uabc")).rejects.toMatchObject({
      code: "NO_ACTIVE_TRIAL",
    });
  });

  it("throws NO_ACTIVE_TRIAL when chat_user_data row is missing", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce(null);

    await expect(PrestigeService.forfeitTrial("Uabc")).rejects.toMatchObject({
      code: "NO_ACTIVE_TRIAL",
    });
  });

  it("throws NO_ACTIVE_TRIAL when active row is missing despite active_trial_id set", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 2,
      active_trial_exp_progress: 0,
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce(null);

    await expect(PrestigeService.forfeitTrial("Uabc")).rejects.toMatchObject({
      code: "NO_ACTIVE_TRIAL",
    });
  });
});

describe("PrestigeService.checkTrialCompletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  it("returns completed:false when active_trial_id is null", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: null,
    });
    const result = await PrestigeService.checkTrialCompletion("Uabc", "Ggroup1");
    expect(result).toEqual({ completed: false });
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("returns completed:false when progress is below required_exp", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 1,
      active_trial_exp_progress: 1500,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
      reward_meta: { type: "trigger_achievement", achievement_slug: "prestige_departure" },
    });

    const result = await PrestigeService.checkTrialCompletion("Uabc", "Ggroup1");
    expect(result).toEqual({ completed: false });
  });

  it("passes the trial, clears active, emits trial_pass with groupIdHint", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 2,
      active_trial_exp_progress: 3100,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 2,
      slug: "hardship",
      star: 2,
      required_exp: 3000,
      reward_meta: { type: "permanent_xp_multiplier", value: 0.1 },
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 55,
      user_id: "Uabc",
      trial_id: 2,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    const result = await PrestigeService.checkTrialCompletion("Uabc", "Ghint");

    expect(UserPrestigeTrial.model.update).toHaveBeenCalledWith(
      55,
      expect.objectContaining({
        status: "passed",
        final_exp_progress: 3100,
      })
    );
    expect(ChatUserData.upsert).toHaveBeenCalledWith(
      "Uabc",
      expect.objectContaining({
        active_trial_id: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
      })
    );
    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uabc");
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Ghint",
      expect.objectContaining({
        type: "trial_pass",
        userId: "Uabc",
        text: "通過了 ★2 的試煉，永久解放 永久 XP +10%",
        payload: { trialId: 2, trialStar: 2, trialSlug: "hardship" },
      })
    );
    expect(result).toEqual({ completed: true, trialId: 2, trialStar: 2 });
  });

  it("falls back to CHAT_USER_LAST_GROUP when groupIdHint is null", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 1,
      active_trial_exp_progress: 2000,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
      reward_meta: { type: "trigger_achievement", achievement_slug: "prestige_departure" },
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 10,
      trial_id: 1,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);
    redis.get.mockResolvedValueOnce("Gfallback");

    await PrestigeService.checkTrialCompletion("Uabc", null);

    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Gfallback",
      expect.objectContaining({ type: "trial_pass" })
    );
  });

  it("formats reward text for cooldown_tier_override as 律動精通", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 3,
      active_trial_exp_progress: 2500,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 3,
      slug: "rhythm",
      star: 3,
      required_exp: 2500,
      reward_meta: { type: "cooldown_tier_override", tiers: { "2-4": 0.7, "4-6": 0.9 } },
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 11,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    await PrestigeService.checkTrialCompletion("Uabc", "Gg");

    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Gg",
      expect.objectContaining({
        text: "通過了 ★3 的試煉，永久解放 律動精通",
      })
    );
  });

  it("formats reward text for group_bonus_double as 群組加成翻倍", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 4,
      active_trial_exp_progress: 2500,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 4,
      slug: "solitude",
      star: 4,
      required_exp: 2500,
      reward_meta: { type: "group_bonus_double" },
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 12,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    await PrestigeService.checkTrialCompletion("Uabc", "Gg");

    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Gg",
      expect.objectContaining({ text: "通過了 ★4 的試煉，永久解放 群組加成翻倍" })
    );
  });
});

const PrestigeBlessing = require("../../src/model/application/PrestigeBlessing");
const UserBlessing = require("../../src/model/application/UserBlessing");
const UserPrestigeHistory = require("../../src/model/application/UserPrestigeHistory");

describe("PrestigeService.prestige", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  it("prestige_count 0 → 1: claims FIFO passed trial, inserts history & blessing, emits prestige broadcast", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      current_level: 100,
      current_exp: 27000,
      active_trial_id: null,
      created_at: new Date("2026-04-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "language_gift",
      display_name: "語言天賦",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest
      .spyOn(UserPrestigeTrial, "listPassedByUserId")
      .mockResolvedValueOnce([
        { id: 1, trial_id: 1, status: "passed", ended_at: new Date("2026-05-01T00:00:00Z") },
      ]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing.model, "create").mockResolvedValueOnce(99);
    jest.spyOn(UserPrestigeHistory.model, "create").mockResolvedValueOnce(100);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);
    redis.get.mockResolvedValueOnce("Glast");

    const result = await PrestigeService.prestige("Uabc", 1);

    expect(UserBlessing.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "Uabc",
        blessing_id: 1,
        acquired_at_prestige: 1,
      })
    );
    expect(UserPrestigeHistory.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "Uabc",
        prestige_count_after: 1,
        trial_id: 1,
        blessing_id: 1,
        cycle_started_at: new Date("2026-04-01T00:00:00Z"),
      })
    );
    expect(ChatUserData.upsert).toHaveBeenCalledWith(
      "Uabc",
      expect.objectContaining({
        prestige_count: 1,
        current_level: 0,
        current_exp: 0,
        awakened_at: null,
      })
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({
        type: "prestige",
        userId: "Uabc",
        text: "完成第 1 次轉生，選擇了祝福『語言天賦』",
        payload: {
          prestigeCount: 1,
          trialId: 1,
          blessingId: 1,
          blessingSlug: "language_gift",
        },
      })
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      ok: true,
      newPrestigeCount: 1,
      trialId: 1,
      blessingId: 1,
      awakened: false,
      groupId: "Glast",
    });
  });

  it("prestige_count 4 → 5: awakens, writes awakened_at, emits BOTH prestige and awakening", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uold",
      prestige_count: 4,
      current_level: 100,
      current_exp: 27000,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 5,
      slug: "rhythm_spring",
      display_name: "節律之泉",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1, 2, 4, 6]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 10, trial_id: 1, ended_at: new Date("2026-02-01T00:00:00Z") },
      { id: 11, trial_id: 2, ended_at: new Date("2026-03-01T00:00:00Z") },
      { id: 12, trial_id: 3, ended_at: new Date("2026-04-01T00:00:00Z") },
      { id: 13, trial_id: 4, ended_at: new Date("2026-05-01T00:00:00Z") },
      { id: 14, trial_id: 5, ended_at: new Date("2026-06-01T00:00:00Z") },
    ]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([
      { prestige_count_after: 1, trial_id: 1, prestiged_at: new Date("2026-02-10T00:00:00Z") },
      { prestige_count_after: 2, trial_id: 2, prestiged_at: new Date("2026-03-10T00:00:00Z") },
      { prestige_count_after: 3, trial_id: 3, prestiged_at: new Date("2026-04-10T00:00:00Z") },
      { prestige_count_after: 4, trial_id: 4, prestiged_at: new Date("2026-05-10T00:00:00Z") },
    ]);
    jest.spyOn(UserPrestigeHistory, "latestByUserId").mockResolvedValueOnce({
      prestige_count_after: 4,
      prestiged_at: new Date("2026-05-10T00:00:00Z"),
    });
    jest.spyOn(UserBlessing.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(UserPrestigeHistory.model, "create").mockResolvedValueOnce(2);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);
    redis.get.mockResolvedValueOnce("Gg");

    const result = await PrestigeService.prestige("Uold", 5);

    expect(UserPrestigeHistory.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        prestige_count_after: 5,
        trial_id: 5,
        blessing_id: 5,
        cycle_started_at: new Date("2026-05-10T00:00:00Z"),
      })
    );
    const upsertArgs = ChatUserData.upsert.mock.calls[0][1];
    expect(upsertArgs.prestige_count).toBe(5);
    expect(upsertArgs.current_level).toBe(0);
    expect(upsertArgs.current_exp).toBe(0);
    expect(upsertArgs.awakened_at).toBeInstanceOf(Date);

    expect(broadcastQueue.pushEvent).toHaveBeenCalledTimes(2);
    expect(broadcastQueue.pushEvent).toHaveBeenNthCalledWith(
      1,
      "Gg",
      expect.objectContaining({ type: "prestige" })
    );
    expect(broadcastQueue.pushEvent).toHaveBeenNthCalledWith(
      2,
      "Gg",
      expect.objectContaining({
        type: "awakening",
        text: "達成覺醒！",
        payload: { prestigeCount: 5 },
      })
    );
    expect(result.awakened).toBe(true);
  });

  it("claims FIFO earliest-passed trial when multiple passes are unused", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Udefer",
      prestige_count: 0,
      current_level: 100,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "language_gift",
      display_name: "語言天賦",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 1, trial_id: 1, ended_at: new Date("2026-03-01T00:00:00Z") },
      { id: 2, trial_id: 3, ended_at: new Date("2026-03-20T00:00:00Z") },
    ]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(UserPrestigeHistory.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    await PrestigeService.prestige("Udefer", 1);

    expect(UserPrestigeHistory.model.create).toHaveBeenCalledWith(
      expect.objectContaining({ trial_id: 1 })
    );
  });

  it("throws AWAKENED when prestige_count is 5", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uawake",
      prestige_count: 5,
      current_level: 100,
    });
    await expect(PrestigeService.prestige("Uawake", 1)).rejects.toMatchObject({ code: "AWAKENED" });
  });

  it("throws NOT_LEVEL_100 when current_level < 100", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Ulow",
      prestige_count: 0,
      current_level: 99,
    });

    await expect(PrestigeService.prestige("Ulow", 1)).rejects.toMatchObject({
      code: "NOT_LEVEL_100",
    });
  });

  it("throws INVALID_BLESSING for unknown blessingId", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      current_level: 100,
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce(null);
    await expect(PrestigeService.prestige("Uabc", 99)).rejects.toMatchObject({
      code: "INVALID_BLESSING",
    });
  });

  it("throws BLESSING_ALREADY_OWNED when user already has this blessing", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 2,
      current_level: 100,
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "language_gift",
      display_name: "語言天賦",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1, 4]);
    await expect(PrestigeService.prestige("Uabc", 1)).rejects.toMatchObject({
      code: "BLESSING_ALREADY_OWNED",
    });
  });

  it("throws NO_PASSED_TRIAL when no passed trials are unconsumed", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 1,
      current_level: 100,
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 2,
      slug: "swift_tongue",
      display_name: "迅雷語速",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1]);
    jest
      .spyOn(UserPrestigeTrial, "listPassedByUserId")
      .mockResolvedValueOnce([{ id: 1, trial_id: 1 }]);
    jest
      .spyOn(UserPrestigeHistory, "listByUserId")
      .mockResolvedValueOnce([{ trial_id: 1, prestige_count_after: 1 }]);
    await expect(PrestigeService.prestige("Uabc", 2)).rejects.toMatchObject({
      code: "NO_PASSED_TRIAL",
    });
  });

  it("uses UserPrestigeHistory.latestByUserId for cycle_started_at on subsequent prestiges", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 1,
      current_level: 100,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 2,
      slug: "swift_tongue",
      display_name: "迅雷語速",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 1, trial_id: 1 },
      { id: 2, trial_id: 2 },
    ]);
    jest
      .spyOn(UserPrestigeHistory, "listByUserId")
      .mockResolvedValueOnce([{ prestige_count_after: 1, trial_id: 1 }]);
    jest.spyOn(UserPrestigeHistory, "latestByUserId").mockResolvedValueOnce({
      prestige_count_after: 1,
      prestiged_at: new Date("2026-03-15T00:00:00Z"),
    });
    jest.spyOn(UserBlessing.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(UserPrestigeHistory.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    await PrestigeService.prestige("Uabc", 2);

    expect(UserPrestigeHistory.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cycle_started_at: new Date("2026-03-15T00:00:00Z"),
      })
    );
  });
});

describe("PrestigeService.getPrestigeStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns fresh-user shape when chat_user_data is missing", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce(null);
    jest.spyOn(PrestigeTrial, "all").mockResolvedValueOnce([
      { id: 1, slug: "departure", star: 1, display_name: "啟程", required_exp: 2000 },
      { id: 2, slug: "hardship", star: 2, display_name: "刻苦", required_exp: 3000 },
    ]);
    jest
      .spyOn(PrestigeBlessing, "all")
      .mockResolvedValueOnce([
        { id: 1, slug: "language_gift", display_name: "語言天賦", effect_meta: {} },
      ]);

    const status = await PrestigeService.getPrestigeStatus("Unew");

    expect(status.userId).toBe("Unew");
    expect(status.prestigeCount).toBe(0);
    expect(status.awakened).toBe(false);
    expect(status.currentLevel).toBe(0);
    expect(status.canPrestige).toBe(false);
    expect(status.activeTrial).toBeNull();
    expect(status.availableTrials).toHaveLength(2);
    expect(status.availableBlessings).toHaveLength(1);
    expect(status.ownedBlessings).toEqual([]);
    expect(status.passedTrialIds).toEqual([]);
    expect(status.hasUnconsumedPassedTrial).toBe(false);
  });

  it("returns active trial with startedAt + expiresAt when an active trial exists", async () => {
    const startedAt = new Date("2026-04-01T00:00:00Z");
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uactive",
      prestige_count: 0,
      current_level: 40,
      current_exp: 4320,
      active_trial_id: 3,
      active_trial_started_at: startedAt,
      active_trial_exp_progress: 1100,
    });
    jest.spyOn(PrestigeTrial, "all").mockResolvedValueOnce([
      {
        id: 3,
        slug: "rhythm",
        star: 3,
        display_name: "律動",
        required_exp: 2500,
        duration_days: 60,
      },
    ]);
    jest.spyOn(PrestigeBlessing, "all").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);

    const status = await PrestigeService.getPrestigeStatus("Uactive");
    expect(status.activeTrial).toEqual({
      id: 3,
      slug: "rhythm",
      star: 3,
      displayName: "律動",
      requiredExp: 2500,
      progress: 1100,
      startedAt,
      expiresAt: new Date(startedAt.getTime() + 60 * 86_400_000),
    });
  });

  it("excludes passed trials from availableTrials; excludes owned blessings from availableBlessings", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Upart",
      prestige_count: 2,
      current_level: 100,
      current_exp: 27000,
      active_trial_id: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeTrial, "all").mockResolvedValueOnce([
      { id: 1, slug: "departure", star: 1, display_name: "啟程", required_exp: 2000 },
      { id: 2, slug: "hardship", star: 2, display_name: "刻苦", required_exp: 3000 },
      { id: 3, slug: "rhythm", star: 3, display_name: "律動", required_exp: 2500 },
    ]);
    jest.spyOn(PrestigeBlessing, "all").mockResolvedValueOnce([
      { id: 1, slug: "language_gift", display_name: "語言天賦", effect_meta: {} },
      { id: 4, slug: "whispering", display_name: "絮語之心", effect_meta: {} },
    ]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 10, trial_id: 1 },
      { id: 11, trial_id: 2 },
    ]);
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([
      { prestige_count_after: 1, trial_id: 1 },
      { prestige_count_after: 2, trial_id: 2 },
    ]);

    const status = await PrestigeService.getPrestigeStatus("Upart");
    expect(status.availableTrials.map(t => t.id)).toEqual([3]);
    expect(status.availableBlessings.map(b => b.id)).toEqual([4]);
    expect(status.passedTrialIds).toEqual([1, 2]);
    expect(status.hasUnconsumedPassedTrial).toBe(false);
    expect(status.canPrestige).toBe(false);
  });

  it("canPrestige=true when Lv.100 + unconsumed passed trial + unused blessing", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uready",
      prestige_count: 0,
      current_level: 100,
      current_exp: 27000,
      active_trial_id: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest
      .spyOn(PrestigeTrial, "all")
      .mockResolvedValueOnce([
        { id: 1, slug: "departure", star: 1, display_name: "啟程", required_exp: 2000 },
      ]);
    jest
      .spyOn(PrestigeBlessing, "all")
      .mockResolvedValueOnce([
        { id: 1, slug: "language_gift", display_name: "語言天賦", effect_meta: {} },
      ]);
    jest
      .spyOn(UserPrestigeTrial, "listPassedByUserId")
      .mockResolvedValueOnce([{ id: 10, trial_id: 1 }]);
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);

    const status = await PrestigeService.getPrestigeStatus("Uready");
    expect(status.canPrestige).toBe(true);
    expect(status.hasUnconsumedPassedTrial).toBe(true);
  });

  it("awakened=true when prestige_count === 5, canPrestige=false", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uawake",
      prestige_count: 5,
      current_level: 30,
      current_exp: 2430,
      awakened_at: new Date("2026-06-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeTrial, "all").mockResolvedValueOnce([]);
    jest.spyOn(PrestigeBlessing, "all").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);

    const status = await PrestigeService.getPrestigeStatus("Uawake");
    expect(status.awakened).toBe(true);
    expect(status.canPrestige).toBe(false);
    expect(status.prestigeCount).toBe(5);
  });
});
