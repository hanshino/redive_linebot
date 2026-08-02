jest.mock("../../src/model/application/ChatExpEvent", () => ({
  findInRange: jest.fn(),
  findLatestByUser: jest.fn(),
}));
jest.mock("../../src/model/application/ChatExpDaily", () => ({
  findByUserDate: jest.fn(),
  model: { all: jest.fn() },
}));
jest.mock("../../src/model/application/UserBlessing", () => ({
  listBlessingIdsByUserId: jest.fn(),
}));
jest.mock("../../src/service/ChatWeatherService", () => ({
  getWeatherForDate: jest.fn(),
}));

const ChatExpEvent = require("../../src/model/application/ChatExpEvent");
const ChatExpDaily = require("../../src/model/application/ChatExpDaily");
const UserBlessing = require("../../src/model/application/UserBlessing");
const ChatWeatherService = require("../../src/service/ChatWeatherService");
const XpHistoryService = require("../../src/service/XpHistoryService");

describe("XpHistoryService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ChatWeatherService.getWeatherForDate.mockResolvedValue(null);
  });

  describe("buildSummary", () => {
    test("returns today.tier=1 when raw_exp < tier1_upper", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 200,
        effective_exp: 200,
        msg_count: 40,
        honeymoon_active: 1,
        trial_id: null,
      });
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.today.tier).toBe(1);
      expect(summary.today.raw_exp).toBe(200);
      expect(summary.today.tier1_upper).toBe(400);
      expect(summary.today.tier2_upper).toBe(1000);
      expect(summary.today.honeymoon_active).toBe(true);
      expect(summary.today.active_trial_star).toBeNull();
    });

    test("blessing 4 expands tier1_upper to 600", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 500,
        effective_exp: 500,
        msg_count: 100,
        honeymoon_active: 0,
        trial_id: null,
      });
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([4]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.today.tier1_upper).toBe(600);
      expect(summary.today.tier).toBe(1);
    });

    test("raw_exp between tier1 and tier2 → tier 2", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 800,
        effective_exp: 520,
        msg_count: 160,
        honeymoon_active: 0,
        trial_id: null,
      });
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.today.tier).toBe(2);
    });

    test("raw_exp past tier2_upper → tier 3", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 1500,
        effective_exp: 720,
        msg_count: 280,
        honeymoon_active: 0,
        trial_id: 5,
      });
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.today.tier).toBe(3);
      expect(summary.today.active_trial_star).toBeNull(); // last_event is null, so summary doesn't surface trial star
    });

    test("no events today → raw_exp=0 / tier=1 / last_event=null", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue(null);
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.today.raw_exp).toBe(0);
      expect(summary.today.tier).toBe(1);
      expect(summary.last_event).toBeNull();
    });

    test("returns last_event with the multiplier columns", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue(null);
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue({
        ts: "2026-05-01T20:14:32",
        group_id: "G1",
        raw_exp: 5,
        effective_exp: 0,
        base_xp: "5.000",
        cooldown_rate: "1.000",
        group_bonus: "1.000",
        blessing1_mult: "1.000",
        honeymoon_mult: "1.000",
        diminish_factor: "0.030",
        trial_mult: "0.500",
        permanent_mult: "1.050",
        modifiers: '{"active_trial_star":5,"blessings":[]}',
      });

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.last_event).not.toBeNull();
      expect(summary.last_event.base_xp).toBe(5);
      expect(summary.last_event.diminish_factor).toBe(0.03);
      expect(summary.last_event.modifiers.active_trial_star).toBe(5);
      // active_trial_star is surfaced from the latest event into today
      expect(summary.today.active_trial_star).toBe(5);
    });
  });

  describe("buildSummary alchemy", () => {
    const alchemyWeather = (rate = 50) => ({
      weather_key: "alchemy_mist",
      category: "debuff",
      name: "煉金霧靄",
      effects: { exp_to_stone_rate: rate },
    });

    beforeEach(() => {
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);
    });

    test("non-alchemy day → alchemy_exp 0, stones 0, rate null", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 300,
        effective_exp: 300,
        alchemy_exp: 0,
        msg_count: 40,
      });
      ChatWeatherService.getWeatherForDate.mockResolvedValue({
        weather_key: "mana_tailwind",
        category: "buff",
        effects: { raw_xp_mult: 1.1 },
      });

      const { today } = await XpHistoryService.buildSummary("U_test");
      expect(today.alchemy_exp).toBe(0);
      expect(today.alchemy_stones).toBe(0);
      expect(today.alchemy_rate).toBeNull();
    });

    test("alchemy day → exp surfaced, rate exposed, stones floored", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 3500,
        effective_exp: 0,
        alchemy_exp: 220,
        msg_count: 40,
      });
      ChatWeatherService.getWeatherForDate.mockResolvedValue(alchemyWeather(50));

      const { today } = await XpHistoryService.buildSummary("U_test");
      expect(today.effective_exp).toBe(0);
      expect(today.alchemy_exp).toBe(220);
      expect(today.alchemy_rate).toBe(50);
      expect(today.alchemy_stones).toBe(4);
    });

    test("alchemy exp below one stone → no phantom stone", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 60,
        effective_exp: 0,
        alchemy_exp: 49,
        msg_count: 3,
      });
      ChatWeatherService.getWeatherForDate.mockResolvedValue(alchemyWeather(50));

      const { today } = await XpHistoryService.buildSummary("U_test");
      expect(today.alchemy_exp).toBe(49);
      expect(today.alchemy_rate).toBe(50);
      expect(today.alchemy_stones).toBe(0);
    });

    test("weather feature disabled (null weather) → rate null, no crash", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 300,
        effective_exp: 300,
        alchemy_exp: 0,
        msg_count: 40,
      });
      ChatWeatherService.getWeatherForDate.mockResolvedValue(null);

      const { today } = await XpHistoryService.buildSummary("U_test");
      expect(today.alchemy_rate).toBeNull();
      expect(today.alchemy_stones).toBe(0);
    });

    test("legacy daily row without alchemy_exp → 0, never NaN", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 300,
        effective_exp: 300,
        msg_count: 40,
      });
      ChatWeatherService.getWeatherForDate.mockResolvedValue(alchemyWeather(50));

      const { today } = await XpHistoryService.buildSummary("U_test");
      expect(today.alchemy_exp).toBe(0);
      expect(today.alchemy_stones).toBe(0);
    });

    test("no daily row at all → alchemy fields still present and zeroed", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue(null);
      ChatWeatherService.getWeatherForDate.mockResolvedValue(alchemyWeather(50));

      const { today } = await XpHistoryService.buildSummary("U_test");
      expect(today.alchemy_exp).toBe(0);
      expect(today.alchemy_stones).toBe(0);
      expect(today.alchemy_rate).toBe(50);
    });

    test("weather is fetched in parallel, not serially awaited", async () => {
      // Hold the first Promise.all member pending; if weather were a serial
      // await after it, getWeatherForDate would never have been called yet.
      let releaseDaily;
      ChatExpDaily.findByUserDate.mockReturnValue(
        new Promise(resolve => {
          releaseDaily = () => resolve(null);
        })
      );
      ChatWeatherService.getWeatherForDate.mockResolvedValue(null);

      const pending = XpHistoryService.buildSummary("U_test");
      await Promise.resolve();
      expect(ChatWeatherService.getWeatherForDate).toHaveBeenCalledTimes(1);

      releaseDaily();
      await pending;
    });
  });
});
