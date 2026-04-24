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
