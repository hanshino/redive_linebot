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

const ChatExpEvent = require("../../src/model/application/ChatExpEvent");
const ChatExpDaily = require("../../src/model/application/ChatExpDaily");
const UserBlessing = require("../../src/model/application/UserBlessing");
const XpHistoryService = require("../../src/service/XpHistoryService");

describe("XpHistoryService", () => {
  beforeEach(() => jest.clearAllMocks());

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
});
