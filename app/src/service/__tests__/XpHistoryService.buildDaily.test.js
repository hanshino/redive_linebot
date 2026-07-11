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

  async function seedDay(protectedCount) {
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
});
