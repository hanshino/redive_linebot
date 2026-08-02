require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");
const { buildDaily } = require("../XpHistoryService");

const USER = "U" + "9".repeat(32);
const DATE = "2001-02-03"; // 固定過去日期，避免與真實資料衝突

describe("buildDaily weather + protection coverage (real DB)", () => {
  beforeEach(async () => {
    await mysql("chat_exp_daily").where({ user_id: USER }).delete();
    await mysql("chat_daily_weather").where({ date: DATE }).delete();
  });
  afterAll(() => mysql.destroy());

  async function seedDay(protectedCount, extra = {}) {
    await mysql("chat_exp_daily").where({ user_id: USER }).delete();
    await mysql("chat_exp_daily").insert({
      user_id: USER,
      date: DATE,
      raw_exp: 100,
      effective_exp: 80,
      msg_count: 5,
      protected_msg_count: protectedCount,
      honeymoon_active: 0,
      trial_id: null,
      ...extra,
    });
  }

  it("joins global weather and derives protection coverage from protected_msg_count", async () => {
    await mysql("chat_daily_weather").insert({
      date: DATE,
      weather_key: "silent_fog",
      category: "debuff",
      name: "沉默霧氣",
      flavor_text: "x",
      effects: JSON.stringify({ raw_xp_mult: 0.9 }),
      protection_type: "defog",
      protection_name: "破霧鈴",
      protection_cost: 30,
      generated_at: new Date(),
    });

    await seedDay(0);
    let res = await buildDaily(USER, { from: DATE, to: DATE });
    expect(res.days).toHaveLength(1);
    expect(res.days[0].weather).toMatchObject({ key: "silent_fog", category: "debuff" });
    expect(res.days[0].weather_protection).toBeNull();

    await seedDay(2);
    res = await buildDaily(USER, { from: DATE, to: DATE });
    expect(res.days[0].weather_protection).toBe("partial");

    await seedDay(5);
    res = await buildDaily(USER, { from: DATE, to: DATE });
    expect(res.days[0].weather_protection).toBe("full");
  });

  it("surfaces alchemy_exp and derives alchemy_stones from the joined rate", async () => {
    await mysql("chat_daily_weather").insert({
      date: DATE,
      weather_key: "alchemy_mist",
      category: "debuff",
      name: "煉金霧靄",
      flavor_text: "x",
      effects: JSON.stringify({ exp_to_stone_rate: 50 }),
      protection_type: "growth_ward",
      protection_name: "成長護符",
      protection_cost: 30,
      generated_at: new Date(),
    });

    await seedDay(0, { effective_exp: 0, alchemy_exp: 220 });
    let res = await buildDaily(USER, { from: DATE, to: DATE });
    expect(res.days[0].alchemy_exp).toBe(220);
    expect(res.days[0].alchemy_stones).toBe(4);

    // below one stone → no phantom stone
    await seedDay(0, { effective_exp: 0, alchemy_exp: 49 });
    res = await buildDaily(USER, { from: DATE, to: DATE });
    expect(res.days[0].alchemy_exp).toBe(49);
    expect(res.days[0].alchemy_stones).toBe(0);
  });

  it("non-alchemy day reports zero alchemy exp and stones", async () => {
    await mysql("chat_daily_weather").insert({
      date: DATE,
      weather_key: "mana_tailwind",
      category: "buff",
      name: "魔力順風",
      flavor_text: "x",
      effects: JSON.stringify({ raw_xp_mult: 1.1 }),
      generated_at: new Date(),
    });

    await seedDay(0);
    const res = await buildDaily(USER, { from: DATE, to: DATE });
    expect(res.days[0].alchemy_exp).toBe(0);
    expect(res.days[0].alchemy_stones).toBe(0);
  });
});
