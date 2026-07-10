const { shapeEvent } = require("../XpHistoryService");

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
