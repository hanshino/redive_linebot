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
  it("maps joined weather + protection columns", () => {
    const d = shapeDay({
      date: "2026-07-10",
      raw_exp: 100,
      effective_exp: 80,
      msg_count: 5,
      honeymoon_active: 0,
      trial_id: null,
      weather_key: "silent_fog",
      weather_name: "沉默霧氣",
      weather_category: "debuff",
      weather_effects: JSON.stringify({ raw_xp_mult: 0.9 }),
      protection_id: 42,
    });
    expect(d.weather).toEqual({
      key: "silent_fog",
      name: "沉默霧氣",
      category: "debuff",
      effects: { raw_xp_mult: 0.9 },
    });
    expect(d.weather_protected).toBe(true);
  });

  it("null weather for days without a weather row", () => {
    const d = shapeDay({ date: "2026-01-01", weather_key: null, protection_id: null });
    expect(d.weather).toBeNull();
    expect(d.weather_protected).toBe(false);
  });

  it("weather_protected false on a buff day even if a protection row exists", () => {
    const d = shapeDay({
      date: "x",
      weather_key: "mana_tailwind",
      weather_category: "buff",
      weather_effects: "{}",
      protection_id: 7,
    });
    expect(d.weather_protected).toBe(false);
  });
});
