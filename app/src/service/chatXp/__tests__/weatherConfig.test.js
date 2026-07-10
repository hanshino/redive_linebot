const config = require("config");

describe("chat_level.dailyWeather config", () => {
  const cfg = config.get("chat_level.dailyWeather");

  it("is present and defaults to disabled", () => {
    expect(cfg.enabled).toBe(false);
    expect(cfg.purchaseEnabled).toBe(false);
    expect(cfg.weights).toEqual({ buff: 60, debuff: 40 });
  });

  it("has 3 debuff + 3 buff weathers, only debuffs are protectable", () => {
    const pool = cfg.pool;
    const entries = Object.values(pool);
    expect(entries.filter(w => w.category === "debuff")).toHaveLength(3);
    expect(entries.filter(w => w.category === "buff")).toHaveLength(3);
    for (const w of entries) {
      expect(w.name && w.flavorText && w.effects).toBeTruthy();
      if (w.category === "debuff") expect(w.protectionType).toBeTruthy();
      if (w.category === "buff") expect(w.protectionType).toBeUndefined();
    }
  });
});
