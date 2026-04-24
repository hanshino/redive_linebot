const chatUserState = require("../../src/util/chatUserState");
const redis = require("../../src/util/redis");
const mysql = require("../../src/util/mysql");
const ChatUserData = require("../../src/model/application/ChatUserData");
const UserBlessing = require("../../src/model/application/UserBlessing");

describe("chatUserState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("STATE_KEY", () => {
    it("formats key with userId prefix", () => {
      expect(chatUserState.STATE_KEY("Uabc")).toBe("CHAT_USER_STATE_Uabc");
    });
  });

  describe("hydrate", () => {
    it("returns all-zero default state for unknown user", async () => {
      jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce(null);
      jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
      // mysql("user_prestige_trials").join(...).where(...).select(...) -> returns [] for "no passed trials"
      mysql.mockReturnValue({
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]),
        first: jest.fn().mockResolvedValue(null),
      });

      const state = await chatUserState.hydrate("Unew");
      expect(state).toEqual({
        user_id: "Unew",
        prestige_count: 0,
        current_level: 0,
        current_exp: 0,
        blessings: [],
        active_trial_id: null,
        active_trial_star: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
        permanent_xp_multiplier: 0,
        rhythm_mastery: false,
        group_bonus_double: false,
      });
    });

    it("aggregates passed-trial rewards into state fields", async () => {
      jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
        user_id: "Uold",
        prestige_count: 2,
        current_level: 40,
        current_exp: 4320,
        active_trial_id: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
      });
      jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1, 4]);

      const passedRows = [
        { star: 2, reward_meta: JSON.stringify({ type: "permanent_xp_multiplier", value: 0.1 }) },
        {
          star: 3,
          reward_meta: JSON.stringify({
            type: "cooldown_tier_override",
            tiers: { "2-4": 0.7, "4-6": 0.9 },
          }),
        },
      ];
      mysql.mockImplementation(() => {
        const qb = {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue(passedRows),
          first: jest.fn().mockResolvedValue(null),
        };
        return qb;
      });

      const state = await chatUserState.hydrate("Uold");
      expect(state.prestige_count).toBe(2);
      expect(state.current_level).toBe(40);
      expect(state.current_exp).toBe(4320);
      expect(state.blessings).toEqual([1, 4]);
      expect(state.permanent_xp_multiplier).toBeCloseTo(0.1, 5);
      expect(state.rhythm_mastery).toBe(true);
      expect(state.group_bonus_double).toBe(false);
    });

    it("resolves active_trial_star from prestige_trials when trial is active", async () => {
      jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
        user_id: "Uactive",
        prestige_count: 1,
        current_level: 50,
        current_exp: 6750,
        active_trial_id: 3,
        active_trial_started_at: "2026-04-10T00:00:00Z",
        active_trial_exp_progress: 1200,
      });
      jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1]);

      // First mysql() call is for passed trials (returns []), second is for prestige_trials by id.
      let call = 0;
      mysql.mockImplementation(() => {
        call++;
        if (call === 1) {
          return {
            join: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([]),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 3, star: 3 }),
        };
      });

      const state = await chatUserState.hydrate("Uactive");
      expect(state.active_trial_id).toBe(3);
      expect(state.active_trial_star).toBe(3);
      expect(state.active_trial_exp_progress).toBe(1200);
    });

    it("sums multiple permanent_xp_multiplier rewards (★2 + ★5 = +0.25)", async () => {
      jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
        user_id: "Uboth",
        prestige_count: 4,
        current_level: 0,
        current_exp: 0,
        active_trial_id: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
      });
      jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1, 2, 4, 5]);

      const passedRows = [
        { star: 2, reward_meta: JSON.stringify({ type: "permanent_xp_multiplier", value: 0.1 }) },
        { star: 5, reward_meta: JSON.stringify({ type: "permanent_xp_multiplier", value: 0.15 }) },
        { star: 4, reward_meta: JSON.stringify({ type: "group_bonus_double" }) },
      ];
      mysql.mockImplementation(() => ({
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(passedRows),
        first: jest.fn().mockResolvedValue(null),
      }));

      const state = await chatUserState.hydrate("Uboth");
      expect(state.permanent_xp_multiplier).toBeCloseTo(0.25, 5);
      expect(state.group_bonus_double).toBe(true);
      expect(state.rhythm_mastery).toBe(false);
    });
  });

  describe("load", () => {
    it("returns cached JSON when Redis has value", async () => {
      const cached = {
        user_id: "Uc",
        prestige_count: 3,
        current_level: 70,
        current_exp: 13230,
        blessings: [1, 2, 6],
        active_trial_id: null,
        active_trial_star: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
        permanent_xp_multiplier: 0.1,
        rhythm_mastery: false,
        group_bonus_double: false,
      };
      redis.get.mockResolvedValueOnce(JSON.stringify(cached));
      const hydrateSpy = jest.spyOn(chatUserState, "hydrate");

      const state = await chatUserState.load("Uc");
      expect(state).toEqual(cached);
      expect(hydrateSpy).not.toHaveBeenCalled();
    });

    it("falls through to hydrate when cached value has wrong shape", async () => {
      // e.g. key collision with an unrelated writer — cached JSON is valid but not a state
      redis.get.mockResolvedValueOnce(JSON.stringify({ foo: "bar" }));
      const fallback = {
        user_id: "Ushape",
        prestige_count: 0,
        current_level: 0,
        current_exp: 0,
        blessings: [],
        active_trial_id: null,
        active_trial_star: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
        permanent_xp_multiplier: 0,
        rhythm_mastery: false,
        group_bonus_double: false,
      };
      jest.spyOn(chatUserState, "hydrate").mockResolvedValueOnce(fallback);

      const state = await chatUserState.load("Ushape");
      expect(state).toEqual(fallback);
    });

    it("hydrates and caches on cache miss", async () => {
      redis.get.mockResolvedValueOnce(null);
      const hydrated = {
        user_id: "Um",
        prestige_count: 0,
        current_level: 0,
        current_exp: 0,
        blessings: [],
        active_trial_id: null,
        active_trial_star: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
        permanent_xp_multiplier: 0,
        rhythm_mastery: false,
        group_bonus_double: false,
      };
      jest.spyOn(chatUserState, "hydrate").mockResolvedValueOnce(hydrated);

      const state = await chatUserState.load("Um");
      expect(state).toEqual(hydrated);
      expect(redis.set).toHaveBeenCalledWith("CHAT_USER_STATE_Um", JSON.stringify(hydrated), {
        EX: 600,
      });
    });
  });

  describe("invalidate", () => {
    it("calls redis.del with the correct key", async () => {
      await chatUserState.invalidate("Uinv");
      expect(redis.del).toHaveBeenCalledWith("CHAT_USER_STATE_Uinv");
    });
  });
});
