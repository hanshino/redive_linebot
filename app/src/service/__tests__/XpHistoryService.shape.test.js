const { shapeEvent, shapeDay } = require("../XpHistoryService");

describe("shapeEvent weather", () => {
  it("exposes weather_protected as a boolean", () => {
    const e = shapeEvent({
      id: 1,
      ts: "2026-07-10 10:00:00",
      group_id: "C1",
      raw_exp: 20,
      effective_exp: 18,
      modifiers: JSON.stringify({ weather: { name: "沉默霧氣", category: "debuff" } }),
      weather_protected: 1,
    });
    expect(e.weather_protected).toBe(true);
    expect(e.modifiers.weather.name).toBe("沉默霧氣");
  });

  it("defaults weather_protected to false for legacy rows", () => {
    const e = shapeEvent({ id: 2, ts: "x", raw_exp: 5, effective_exp: 5, modifiers: null });
    expect(e.weather_protected).toBe(false);
  });
});

describe("shapeDay weather", () => {
  const debuffDay = extra => ({
    date: "2026-07-10",
    raw_exp: 100,
    effective_exp: 80,
    msg_count: 5,
    protected_msg_count: 0,
    honeymoon_active: 0,
    trial_id: null,
    weather_key: "silent_fog",
    weather_name: "沉默霧氣",
    weather_category: "debuff",
    weather_effects: JSON.stringify({ raw_xp_mult: 0.9 }),
    ...extra,
  });

  it("maps joined weather columns", () => {
    expect(shapeDay(debuffDay()).weather).toEqual({
      key: "silent_fog",
      name: "沉默霧氣",
      category: "debuff",
      effects: { raw_xp_mult: 0.9 },
    });
  });

  it("weather_protection 'full' when every message was covered", () => {
    expect(shapeDay(debuffDay({ protected_msg_count: 5 })).weather_protection).toBe("full");
  });

  it("weather_protection 'partial' when a mid-day purchase covered only some", () => {
    expect(shapeDay(debuffDay({ protected_msg_count: 2 })).weather_protection).toBe("partial");
  });

  it("weather_protection null when the day took the full hit (bought too late / not at all)", () => {
    expect(shapeDay(debuffDay({ protected_msg_count: 0 })).weather_protection).toBeNull();
  });

  it("weather_protection null on a buff day regardless of count", () => {
    const d = shapeDay({
      date: "x",
      msg_count: 5,
      protected_msg_count: 5,
      weather_key: "mana_tailwind",
      weather_category: "buff",
      weather_effects: "{}",
    });
    expect(d.weather_protection).toBeNull();
  });

  it("null weather + null protection for days without a weather row", () => {
    const d = shapeDay({ date: "2026-01-01", weather_key: null });
    expect(d.weather).toBeNull();
    expect(d.weather_protection).toBeNull();
  });
});
