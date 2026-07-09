require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");

const ChatDailyWeather = require("../ChatDailyWeather");
const UserWeatherProtection = require("../UserWeatherProtection");

const DATE = "2099-01-01";
const USER = "U" + "9".repeat(32);

describe("weather models", () => {
  beforeEach(async () => {
    await mysql("user_weather_protections").where({ weather_date: DATE }).delete();
    await mysql("chat_daily_weather").where({ date: DATE }).delete();
  });
  afterAll(() => mysql.destroy());

  it("insertIfAbsent writes once and is idempotent for the same date", async () => {
    const payload = {
      date: DATE,
      weather_key: "noisy_wind",
      category: "debuff",
      name: "風異常的喧囂",
      flavor_text: "風聲把話語吹散。",
      effects: { cooldown_required_mult: 1.1 },
      protection_type: "windproof",
      protection_name: "防風耳飾",
      protection_cost: 30,
      generated_at: new Date(),
    };
    await ChatDailyWeather.insertIfAbsent(payload);
    await ChatDailyWeather.insertIfAbsent({ ...payload, weather_key: "silent_fog" });
    const rows = await mysql("chat_daily_weather").where({ date: DATE });
    expect(rows).toHaveLength(1);
    expect(rows[0].weather_key).toBe("noisy_wind"); // first write wins
    const found = await ChatDailyWeather.findByDate(DATE);
    expect(found.weather_key).toBe("noisy_wind");
  });

  it("createProtection persists a row findable by (user, date)", async () => {
    await UserWeatherProtection.createProtection({
      user_id: USER,
      weather_date: DATE,
      weather_key: "noisy_wind",
      protection_type: "windproof",
      protection_name: "防風耳飾",
      stone_cost: 30,
      purchased_at: new Date(),
    });
    const found = await UserWeatherProtection.findByUserDate(USER, DATE);
    expect(found.protection_type).toBe("windproof");
  });
});
