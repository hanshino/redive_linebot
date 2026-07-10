require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");

const WEATHER_CFG = {
  enabled: true,
  purchaseEnabled: true,
  weights: { debuff: 100 },
  defaultProtectionCost: 30,
  pool: {
    noisy_wind: {
      category: "debuff",
      name: "風異常的喧囂",
      flavorText: "風。",
      effects: { effective_xp_mult: 0.9 },
      protectionType: "windproof",
      protectionName: "防風耳飾",
      protectionCost: 30,
    },
  },
};
jest.mock("config", () => {
  const orig = jest.requireActual("config");
  return { get: jest.fn(k => (k === "chat_level.dailyWeather" ? WEATHER_CFG : orig.get(k))) };
});
// base rate: force redis miss so config default (90) is used. chatUserState.load
// also uses redis.get/.set (cache miss → hydrate → cache write), so both methods
// must be present or the pipeline throws mid-batch.
jest.mock("../../../util/redis", () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(0),
}));
// silence level-up notifications
jest.mock("../../../util/broadcastQueue", () => ({ pushEvent: jest.fn().mockResolvedValue() }));

const { todayUtc8 } = require("../../../util/date");
const { processBatch } = require("../pipeline");

const TODAY = todayUtc8();
const USER = "U" + "6".repeat(32);
const GROUP = "C" + "6".repeat(32);

describe("pipeline weather snapshot", () => {
  beforeEach(async () => {
    await Promise.all([
      mysql("chat_exp_events").where({ user_id: USER }).delete(),
      mysql("chat_exp_daily").where({ user_id: USER }).delete(),
      mysql("chat_user_data").where({ user_id: USER }).delete(),
      mysql("chat_daily_weather").where({ date: TODAY }).delete(),
      mysql("user_weather_protections").where({ user_id: USER }).delete(),
    ]);
  });
  afterAll(() => mysql.destroy());

  it("applies today's weather and snapshots it onto the event row", async () => {
    await processBatch([
      { userId: USER, groupId: GROUP, ts: Date.now(), timeSinceLastMsg: 10000, groupCount: 1 },
    ]);

    const rows = await mysql("chat_exp_events").where({ user_id: USER });
    expect(rows).toHaveLength(1);
    expect(rows[0].weather_key).toBe("noisy_wind");
    expect(rows[0].weather_protected).toBe(0); // no protection bought
    const mods =
      typeof rows[0].modifiers === "string" ? JSON.parse(rows[0].modifiers) : rows[0].modifiers;
    expect(mods.weather.name).toBe("風異常的喧囂");
    expect(mods.weather.category).toBe("debuff");
  });
});
