require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");

const POOL = {
  noisy_wind: {
    category: "debuff",
    name: "風異常的喧囂",
    flavorText: "風聲把話語吹散。",
    effects: { cooldown_required_mult: 1.1 },
    protectionType: "windproof",
    protectionName: "防風耳飾",
    protectionCost: 30,
  },
  mana_tailwind: {
    category: "buff",
    name: "魔力順風",
    flavorText: "順風。",
    effects: { effective_xp_mult: 1.1 },
  },
};
const WEATHER_CFG = {
  enabled: true,
  purchaseEnabled: true,
  weights: { buff: 60, debuff: 40 },
  defaultProtectionCost: 30,
  pool: POOL,
};

jest.mock("config", () => {
  const orig = jest.requireActual("config");
  return {
    get: jest.fn(key => {
      if (key === "chat_level.dailyWeather") return global.__WEATHER_CFG__;
      return orig.get(key);
    }),
  };
});

const Service = require("../ChatWeatherService");

const TODAY = require("../../util/date").todayUtc8();
const USER = "U" + "7".repeat(32);

describe("ChatWeatherService", () => {
  beforeEach(async () => {
    global.__WEATHER_CFG__ = JSON.parse(JSON.stringify(WEATHER_CFG));
    await mysql("user_weather_protections").where({ user_id: USER }).delete();
    await mysql("chat_daily_weather").where({ date: TODAY }).delete();
    await mysql("inventory").where({ userId: USER, itemId: 999 }).delete();
  });
  afterAll(() => mysql.destroy());

  it("getWeatherForDate returns null when disabled", async () => {
    global.__WEATHER_CFG__.enabled = false;
    expect(await Service.getWeatherForDate(TODAY)).toBeNull();
  });

  it("lazily generates exactly one row and is idempotent", async () => {
    const a = await Service.getWeatherForDate(TODAY);
    const b = await Service.getWeatherForDate(TODAY);
    expect(a.weather_key).toBe(b.weather_key);
    expect(typeof a.effects).toBe("object"); // normalised, not a JSON string
    const rows = await mysql("chat_daily_weather").where({ date: TODAY });
    expect(rows).toHaveLength(1);
  });

  it("purchase deducts stones and inserts protection atomically", async () => {
    // Force a debuff day by leaving only the debuff weather in the pool.
    global.__WEATHER_CFG__.pool = { noisy_wind: POOL.noisy_wind };
    await mysql("inventory").insert({ userId: USER, itemId: 999, itemAmount: 100, note: "seed" });

    const res = await Service.purchaseTodayProtection(USER);
    expect(res.ok).toBe(true);

    const prot = await mysql("user_weather_protections").where({
      user_id: USER,
      weather_date: TODAY,
    });
    expect(prot).toHaveLength(1);
    const bal = await require("../../model/princess/gacha").getUserGodStoneCount(USER);
    expect(Number(bal)).toBe(70); // 100 - 30
  });

  it("rejects duplicate purchase", async () => {
    global.__WEATHER_CFG__.pool = { noisy_wind: POOL.noisy_wind };
    await mysql("inventory").insert({ userId: USER, itemId: 999, itemAmount: 100, note: "seed" });
    await Service.purchaseTodayProtection(USER);
    const res = await Service.purchaseTodayProtection(USER);
    expect(res).toMatchObject({ ok: false, code: "ALREADY_PROTECTED" });
  });

  it("rejects insufficient stones (no protection row, no debit)", async () => {
    global.__WEATHER_CFG__.pool = { noisy_wind: POOL.noisy_wind };
    await mysql("inventory").insert({ userId: USER, itemId: 999, itemAmount: 10, note: "seed" });
    const res = await Service.purchaseTodayProtection(USER);
    expect(res).toMatchObject({ ok: false, code: "INSUFFICIENT_STONE" });
    const prot = await mysql("user_weather_protections").where({
      user_id: USER,
      weather_date: TODAY,
    });
    expect(prot).toHaveLength(0);
    const bal = await require("../../model/princess/gacha").getUserGodStoneCount(USER);
    expect(Number(bal)).toBe(10);
  });

  it("rejects purchase on a pure-buff day", async () => {
    global.__WEATHER_CFG__.pool = { mana_tailwind: POOL.mana_tailwind };
    await mysql("inventory").insert({ userId: USER, itemId: 999, itemAmount: 100, note: "seed" });
    const res = await Service.purchaseTodayProtection(USER);
    expect(res).toMatchObject({ ok: false, code: "NO_PROTECTION" });
  });
});
