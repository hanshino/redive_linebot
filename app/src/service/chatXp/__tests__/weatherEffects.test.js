const {
  resolveEffectiveEffects,
  mult,
  silenceMult,
  pickWeather,
  describeEffects,
} = require("../weatherEffects");

// rand that yields the given values in order, then repeats the last.
const mkRand = vals => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

describe("resolveEffectiveEffects", () => {
  const debuff = { category: "debuff", effects: { cooldown_required_mult: 1.1 } };
  const buff = { category: "buff", effects: { effective_xp_mult: 1.1 } };
  const prot = { purchased_at: new Date("2026-07-09T02:00:00Z") };
  const before = new Date("2026-07-09T01:00:00Z").getTime();
  const after = new Date("2026-07-09T03:00:00Z").getTime();

  it("no weather → neutral", () => {
    expect(resolveEffectiveEffects(null, null, after)).toEqual({ effects: {}, protected: false });
  });
  it("debuff + protection + event after purchase → neutralised", () => {
    expect(resolveEffectiveEffects(debuff, prot, after)).toEqual({ effects: {}, protected: true });
  });
  it("debuff + protection + event exactly at purchase time → protected (>= boundary)", () => {
    const at = new Date("2026-07-09T02:00:00Z").getTime();
    expect(resolveEffectiveEffects(debuff, prot, at)).toEqual({ effects: {}, protected: true });
  });
  it("debuff + protection + event before purchase → not protected", () => {
    expect(resolveEffectiveEffects(debuff, prot, before)).toEqual({
      effects: { cooldown_required_mult: 1.1 },
      protected: false,
    });
  });
  it("debuff + no protection → original effects", () => {
    expect(resolveEffectiveEffects(debuff, null, after)).toEqual({
      effects: { cooldown_required_mult: 1.1 },
      protected: false,
    });
  });
  it("buff is never protected even if a protection row exists", () => {
    expect(resolveEffectiveEffects(buff, prot, after)).toEqual({
      effects: { effective_xp_mult: 1.1 },
      protected: false,
    });
  });
});

describe("mult", () => {
  it("returns the field when a positive number", () => {
    expect(mult({ raw_xp_mult: 0.9 }, "raw_xp_mult")).toBe(0.9);
  });
  it("returns 1 for missing / non-positive / non-number", () => {
    expect(mult({}, "raw_xp_mult")).toBe(1);
    expect(mult({ raw_xp_mult: 0 }, "raw_xp_mult")).toBe(1);
    expect(mult(null, "raw_xp_mult")).toBe(1);
    expect(mult({ x: -1 }, "x")).toBe(1);
    expect(mult({ x: "1.1" }, "x")).toBe(1);
  });
});

describe("silenceMult", () => {
  const effects = {
    silence_burst: [
      { gapMs: 86400000, mult: 10 },
      { gapMs: 21600000, mult: 5 },
      { gapMs: 3600000, mult: 2 },
    ],
  };

  it("null uses the highest tier", () => expect(silenceMult(effects, null)).toBe(10));
  it("matches a tier at its exact boundary", () => expect(silenceMult(effects, 21600000)).toBe(5));
  it("returns identity below the smallest tier", () =>
    expect(silenceMult(effects, 3599999)).toBe(1));
  it("returns identity without silence_burst", () => expect(silenceMult({}, 86400000)).toBe(1));
  it("returns identity for an empty tier list", () =>
    expect(silenceMult({ silence_burst: [] }, 86400000)).toBe(1));
});

describe("pickWeather", () => {
  // pool order: 3 debuff then 3 buff; weights buff:60 debuff:40 → categories ["debuff","buff"]
  const pool = {
    noisy_wind: { category: "debuff" },
    silent_fog: { category: "debuff" },
    low_pressure: { category: "debuff" },
    mana_tailwind: { category: "buff" },
    clear_echo: { category: "buff" },
    bustling_square: { category: "buff" },
  };
  const weights = { buff: 60, debuff: 40 };

  it("r<0.4 → debuff category, index picks within it", () => {
    expect(pickWeather(pool, weights, null, mkRand([0.1, 0.1]))).toBe("noisy_wind");
  });
  it("r>=0.4 → buff category", () => {
    expect(pickWeather(pool, weights, null, mkRand([0.9, 0.9]))).toBe("bustling_square");
  });
  it("skips avoidKey when the category has an alternative", () => {
    expect(pickWeather(pool, weights, "noisy_wind", mkRand([0.1, 0.1]))).toBe("silent_fog");
  });
  it("returns avoidKey when it is the only member of the chosen category", () => {
    expect(
      pickWeather({ solo: { category: "debuff" } }, { debuff: 100 }, "solo", mkRand([0.5, 0.5]))
    ).toBe("solo");
  });
  it("honours per-weather weight: a rare weather needs a higher roll", () => {
    // rare has weight 0.5 against common's default 1 → total 1.5, rare owns the tail third.
    const p = { common: { category: "debuff" }, rare: { category: "debuff", weight: 0.5 } };
    const w = { debuff: 100 };
    expect(pickWeather(p, w, null, mkRand([0.5, 0.6]))).toBe("common");
    expect(pickWeather(p, w, null, mkRand([0.5, 0.7]))).toBe("rare");
  });
});

describe("describeEffects", () => {
  it("formats penalty and bonus with signed percentages", () => {
    expect(describeEffects({ cooldown_required_mult: 1.1 })).toEqual(["冷卻時間需求 +10%"]);
    expect(describeEffects({ raw_xp_mult: 0.9 })).toEqual(["原始經驗 -10%"]);
  });
  it("renders exp_to_stone_rate as a conversion ratio, not a percentage", () => {
    // (value - 1) * 100 would have printed "+4900%" for a rate of 50.
    expect(describeEffects({ exp_to_stone_rate: 50 })).toEqual(["經驗轉女神石 50:1"]);
  });
  it("renders silence_burst as its highest multiplier without NaN", () => {
    expect(describeEffects({ silence_burst: [{ gapMs: 86400000, mult: 10 }] })).toEqual([
      "久違發言 最高 ×10",
    ]);
    expect(describeEffects({ silence_burst: [{ gapMs: 86400000, mult: 10 }] })[0]).not.toContain(
      "NaN"
    );
  });
  it("does not render the alchemy daily cap as an effect", () => {
    expect(describeEffects({ exp_to_stone_rate: 1, exp_to_stone_daily_cap: 100000 })).toEqual([
      "經驗轉女神石 1:1",
    ]);
  });
  it("empty effects → empty list", () => {
    expect(describeEffects({})).toEqual([]);
  });
});
