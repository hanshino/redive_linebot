// mysql + bottender mocks live in __tests__/setup.js (global setupFile).
const {
  _internal: { buildPrestigeFlags, resolveActiveTrialStar, buildSubscriptionCards },
} = require("../ChatLevelController");

describe("ChatLevelController._internal.buildPrestigeFlags", () => {
  it("returns 蜜月 for fresh user (prestige_count=0, no trial)", () => {
    expect(
      buildPrestigeFlags({ prestigeCount: 0, awakened: false, activeTrialStar: null })
    ).toEqual(["🌱 蜜月 +20% XP"]);
  });

  it("stacks 蜜月 with active trial when prestige_count=0", () => {
    expect(buildPrestigeFlags({ prestigeCount: 0, awakened: false, activeTrialStar: 1 })).toEqual([
      "⚔️ ★1 試煉中",
      "🌱 蜜月 +20% XP",
    ]);
  });

  it("renders 轉生 N 次 + active trial when prestige_count>0", () => {
    expect(buildPrestigeFlags({ prestigeCount: 3, awakened: false, activeTrialStar: 4 })).toEqual([
      "⚔️ ★4 試煉中",
      "★★★ 轉生 3 次",
    ]);
  });

  it("renders only 覺醒者 when awakened (suppresses trial + 蜜月 + 轉生 N 次)", () => {
    expect(buildPrestigeFlags({ prestigeCount: 5, awakened: true, activeTrialStar: 5 })).toEqual([
      "✨ 覺醒者",
    ]);
  });

  it("renders 轉生 N 次 alone when no active trial and no honeymoon", () => {
    expect(
      buildPrestigeFlags({ prestigeCount: 2, awakened: false, activeTrialStar: null })
    ).toEqual(["★★ 轉生 2 次"]);
  });
});

describe("ChatLevelController._internal.resolveActiveTrialStar", () => {
  const trials = [
    { id: 1, star: 1 },
    { id: 2, star: 2 },
    { id: 5, star: 5 },
  ];

  it("returns null when no active trial", () => {
    expect(resolveActiveTrialStar(null, trials)).toBeNull();
  });

  it("returns the matching trial star", () => {
    expect(resolveActiveTrialStar(2, trials)).toBe(2);
    expect(resolveActiveTrialStar(5, trials)).toBe(5);
  });

  it("returns null when trial id not found in defs", () => {
    expect(resolveActiveTrialStar(99, trials)).toBeNull();
  });
});

describe("ChatLevelController._internal.buildSubscriptionCards", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const day = 86400000;
  const sub = (key, effects, startOffset, endOffset) => ({
    key,
    effects,
    start_at: new Date(+now + startOffset),
    end_at: new Date(+now + endOffset),
  });

  it("returns the fixed contract shape for a single active card (paused: null)", () => {
    const cards = buildSubscriptionCards(
      [sub("month", [{ type: "gacha_times", value: 1 }], -day, day)],
      now
    );
    expect(cards).toEqual([
      {
        key: "month",
        titleText: "message.subscribe.month",
        expireText: expect.any(String),
        effects: [{ text: "message.subscribe.effects_row_positive", exclusive: false }],
        paused: null,
      },
    ]);
  });

  it("marks the overridden month card exclusive:false and paused (resume) when its own end_at is later than Plus's", () => {
    const cards = buildSubscriptionCards(
      [
        sub("month", [{ type: "gacha_times", value: 1 }], -day, day * 3), // 月卡到期日晚於 Plus
        sub("month_plus", [{ type: "auto_janken_match", value: 1 }], -day, day),
      ],
      now
    );
    const month = cards.find(c => c.key === "month");
    const plus = cards.find(c => c.key === "month_plus");
    expect(month.paused).toBe("resume");
    expect(plus.paused).toBeNull();
    expect(plus.effects).toEqual([
      { text: "message.subscribe.effects_row_feature", exclusive: true },
    ]);
  });

  it("marks the overridden month card paused (expire) when its end_at is on/before Plus's", () => {
    const cards = buildSubscriptionCards(
      [
        sub("month", [{ type: "gacha_times", value: 1 }], -day, day), // 早於或等於 Plus 到期日
        sub("month_plus", [], -day, day * 3),
      ],
      now
    );
    const month = cards.find(c => c.key === "month");
    expect(month.paused).toBe("expire");
  });

  it("season never gets paused, even alongside an active Plus", () => {
    const cards = buildSubscriptionCards(
      [
        sub("season", [{ type: "gacha_times", value: 2 }], -day, day),
        sub("month_plus", [], -day, day),
      ],
      now
    );
    expect(cards.find(c => c.key === "season").paused).toBeNull();
  });

  it("sorts unpaused before paused; within each group by rank month_plus=0, month=1, season=2", () => {
    const cards = buildSubscriptionCards(
      [
        sub("season", [], -day, day),
        sub("month", [], -day, day), // overridden → paused, sorted last
        sub("month_plus", [], -day, day),
      ],
      now
    );
    expect(cards.map(c => c.key)).toEqual(["month_plus", "season", "month"]);
  });

  it("returns an empty array when there is no active subscription", () => {
    expect(buildSubscriptionCards([], now)).toEqual([]);
    expect(buildSubscriptionCards(undefined, now)).toEqual([]);
  });
});
