jest.mock("../../model/application/WorldBossRewardLog", () => ({
  getUnreadForUser: jest.fn(),
}));
jest.mock("../../util/redis", () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
}));

const WorldBossRewardLog = require("../../model/application/WorldBossRewardLog");
const redis = require("../../util/redis");
const svc = require("../WorldBossReportService");

describe("WorldBossReportService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("setUnread writes the flag with an expiry through reportUnreadKey", async () => {
    await svc.setUnread("Ualice");
    expect(redis.set).toHaveBeenCalledWith(
      "wb:report_unread:Ualice",
      "1",
      expect.objectContaining({ EX: expect.any(Number) })
    );
  });

  it("getUnreadReport returns no report when flag is absent", async () => {
    redis.get.mockResolvedValue(null);
    const out = await svc.getUnreadReport("Ualice");
    expect(out.hasReport).toBe(false);
    expect(out.card).toBeNull();
    expect(WorldBossRewardLog.getUnreadForUser).not.toHaveBeenCalled();
  });

  it("getUnreadReport builds a card from the reward row when flag is set (positive grant amounts)", async () => {
    redis.get.mockResolvedValue("1");
    WorldBossRewardLog.getUnreadForUser.mockResolvedValue({
      user_id: "Ualice",
      world_boss_event_id: 9,
      materials: 50, // grants are POSITIVE (addendum §13)
      stones: 30,
      board: "dps",
      rank: 1,
      is_mvp: 1,
    });
    const out = await svc.getUnreadReport("Ualice");
    expect(out.hasReport).toBe(true);
    expect(out.reward.materials).toBe(50);
    expect(out.card).toEqual(expect.objectContaining({ type: "bubble" }));
    // does NOT clear the flag here
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("getUnreadReport returns no report when flag set but no row found", async () => {
    redis.get.mockResolvedValue("1");
    WorldBossRewardLog.getUnreadForUser.mockResolvedValue(undefined);
    const out = await svc.getUnreadReport("Ualice");
    expect(out.hasReport).toBe(false);
    expect(out.card).toBeNull();
  });

  it("markDelivered clears the flag through reportUnreadKey", async () => {
    await svc.markDelivered("Ualice");
    expect(redis.del).toHaveBeenCalledWith("wb:report_unread:Ualice");
  });
});
