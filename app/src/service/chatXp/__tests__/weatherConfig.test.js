const config = require("config");

describe("chat_level.dailyWeather config", () => {
  const cfg = config.get("chat_level.dailyWeather");

  it("has weather and protection purchase both enabled", () => {
    expect(cfg.enabled).toBe(true);
    expect(cfg.purchaseEnabled).toBe(true);
    expect(cfg.weights).toEqual({ buff: 60, debuff: 40 });
  });

  it("has 4 debuff + 3 buff weathers, only debuffs are protectable", () => {
    const pool = cfg.pool;
    const entries = Object.values(pool);
    expect(entries.filter(w => w.category === "debuff")).toHaveLength(4);
    expect(entries.filter(w => w.category === "buff")).toHaveLength(3);
    for (const w of entries) {
      expect(w.name && w.flavorText && w.effects).toBeTruthy();
      if (w.category === "debuff") expect(w.protectionType).toBeTruthy();
      if (w.category === "buff") expect(w.protectionType).toBeUndefined();
    }
  });

  it("alchemy_mist carries a positive conversion rate (the tuning knob)", () => {
    const rate = cfg.pool.alchemy_mist.effects.exp_to_stone_rate;
    expect(typeof rate).toBe("number");
    expect(rate).toBeGreaterThan(0);
  });
});
