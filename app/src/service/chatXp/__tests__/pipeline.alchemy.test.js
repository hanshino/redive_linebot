require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");

// Rate lives on the DB weather row (pipeline reads ctx.weather.effects), so each
// test pre-inserts the row it wants. The config pool only matters for the
// auto-generation path exercised by the first case.
const RATE = 50;
const WEATHER_CFG = {
  enabled: true,
  purchaseEnabled: true,
  weights: { debuff: 100 },
  defaultProtectionCost: 30,
  pool: {
    alchemy_mist: {
      category: "debuff",
      name: "鍊金之霧",
      flavorText: "霧裡的話語不再化作成長，而是凝成石粒落下。",
      effects: { exp_to_stone_rate: RATE },
      protectionType: "growth_ward",
      protectionName: "成長護符",
      protectionCost: 30,
    },
  },
};
jest.mock("config", () => {
  const orig = jest.requireActual("config");
  return { get: jest.fn(k => (k === "chat_level.dailyWeather" ? WEATHER_CFG : orig.get(k))) };
});
jest.mock("../../../util/redis", () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(0),
}));
jest.mock("../../../util/broadcastQueue", () => ({ pushEvent: jest.fn().mockResolvedValue() }));
// chat_daily_weather's PK is `date` alone, so a suite that regenerates "today"
// fights pipeline.weather.test.js when jest runs them in parallel workers. Pin
// this suite to a sentinel date so the two never touch the same row.
const TODAY = "2099-01-01";
jest.mock("../../../util/date", () => ({
  ...jest.requireActual("../../../util/date"),
  todayUtc8: () => "2099-01-01",
}));

const { processBatch } = require("../pipeline");

// U4…/C4… is unused by every other DB-backed suite; ChatWeatherService.test.js
// owns U7… and shares the `inventory` table, so reusing it corrupts both balances.
const USER = "U" + "4".repeat(32);
const GROUP = "C" + "4".repeat(32);

// base 90 × cooldownRate 1.0 (gap > 6s) × groupBonus 1.0 (count < 5) × honeymoon
// 1.2, all inside diminish tier 1 → a flat 108 effective exp per message.
const PER_MSG = 108;
const TRIAL_ID = 1; // ★1 departure: trialMult 1.0, so PER_MSG is unchanged

const msg = (ts = Date.now()) => ({
  userId: USER,
  groupId: GROUP,
  ts,
  timeSinceLastMsg: 10000,
  groupCount: 1,
});

async function insertWeather(rate) {
  await mysql("chat_daily_weather").insert({
    date: TODAY,
    weather_key: "alchemy_mist",
    category: "debuff",
    name: "鍊金之霧",
    flavor_text: "霧。",
    effects: JSON.stringify({ exp_to_stone_rate: rate }),
    protection_type: "growth_ward",
    protection_name: "成長護符",
    protection_cost: 30,
    generated_at: new Date(),
  });
}

const stoneBalance = async () => {
  const row = await mysql("inventory")
    .where({ userId: USER, itemId: 999 })
    .sum({ amount: "itemAmount" })
    .first();
  return Number(row.amount || 0);
};

const dailyRow = () => mysql("chat_exp_daily").where({ user_id: USER }).first();
const userRow = () => mysql("chat_user_data").where({ user_id: USER }).first();

describe("pipeline alchemy mist", () => {
  beforeEach(async () => {
    await Promise.all([
      mysql("chat_exp_events").where({ user_id: USER }).delete(),
      mysql("chat_exp_daily").where({ user_id: USER }).delete(),
      mysql("chat_user_data").where({ user_id: USER }).delete(),
      mysql("chat_daily_weather").where({ date: TODAY }).delete(),
      mysql("user_weather_protections").where({ user_id: USER }).delete(),
      mysql("inventory").where({ userId: USER, itemId: 999 }).delete(),
    ]);
  });
  afterAll(() => mysql.destroy());

  it("diverts exp to god stones: level/exp frozen, stones credited, alchemy_exp accrues", async () => {
    // no pre-inserted row → also covers weather auto-generation from the config pool
    await processBatch([msg()]);

    const user = await userRow();
    // 108 exp would otherwise have reached Lv.2 (curve: Lv2 = 52 total exp)
    expect(user.current_exp).toBe(0);
    expect(user.current_level).toBe(0);

    expect(await stoneBalance()).toBe(Math.floor(PER_MSG / RATE)); // 2

    const daily = await dailyRow();
    expect(daily.alchemy_exp).toBe(PER_MSG);
    expect(daily.effective_exp).toBe(0);
    // the event log keeps the full computed value — audit trail is unchanged
    expect(daily.raw_exp).toBe(90);
    expect(daily.msg_count).toBe(1);

    const events = await mysql("chat_exp_events").where({ user_id: USER });
    expect(events).toHaveLength(1);
    expect(events[0].effective_exp).toBe(PER_MSG);
    expect(events[0].weather_key).toBe("alchemy_mist");
    expect(events[0].weather_protected).toBe(0);
  });

  // INVARIANT: a random weather must never eat trial progress (hard 60-day deadline).
  it("advances active trial progress by the FULL amount under alchemy", async () => {
    await insertWeather(RATE);
    await mysql("chat_user_data").insert({
      user_id: USER,
      active_trial_id: TRIAL_ID,
      active_trial_started_at: new Date(),
      active_trial_exp_progress: 0,
    });

    await processBatch([msg()]);

    const user = await userRow();
    expect(user.active_trial_exp_progress).toBe(PER_MSG); // full, as if no weather
    expect(user.current_exp).toBe(0); // still no level progress
    expect((await dailyRow()).alchemy_exp).toBe(PER_MSG);
  });

  it("carries the sub-stone remainder across batches via the day-cumulative counter", async () => {
    // rate 200 > PER_MSG, so each batch alone floors to 0 stones
    const bigRate = 200;
    await insertWeather(bigRate);

    await processBatch([msg()]);
    expect(await stoneBalance()).toBe(0);
    expect((await dailyRow()).alchemy_exp).toBe(PER_MSG);

    await processBatch([msg()]);
    const daily = await dailyRow();
    expect(daily.alchemy_exp).toBe(PER_MSG * 2); // 216
    // 216/200 → 1 stone total; naive per-batch flooring would have minted 0
    expect(await stoneBalance()).toBe(Math.floor((PER_MSG * 2) / bigRate));
    expect((await userRow()).current_exp).toBe(0);
  });

  it("a protected user earns normal exp, not stones", async () => {
    await insertWeather(RATE);
    await mysql("user_weather_protections").insert({
      user_id: USER,
      weather_date: TODAY,
      weather_key: "alchemy_mist",
      protection_type: "growth_ward",
      protection_name: "成長護符",
      stone_cost: 30,
      purchased_at: new Date(Date.now() - 60000),
    });

    await processBatch([msg()]);

    const user = await userRow();
    expect(user.current_exp).toBe(PER_MSG);
    expect(user.current_level).toBe(2);

    expect(await stoneBalance()).toBe(0);

    const daily = await dailyRow();
    expect(daily.alchemy_exp).toBe(0);
    expect(daily.effective_exp).toBe(PER_MSG);
    expect(daily.protected_msg_count).toBe(1);
  });
});
