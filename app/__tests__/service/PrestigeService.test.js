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
