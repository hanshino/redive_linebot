// mysql + bottender mocks live in __tests__/setup.js (global setupFile).
const {
  _internal: { buildPrestigeFlags, resolveActiveTrialStar },
} = require("../ChatLevelController");

describe("ChatLevelController._internal.buildPrestigeFlags", () => {
  it("returns 蜜月 for fresh user (prestige_count=0, no trial)", () => {
    expect(
      buildPrestigeFlags({ prestigeCount: 0, awakened: false, activeTrialStar: null })
    ).toEqual(["🌱 蜜月中"]);
  });

  it("stacks 蜜月 with active trial when prestige_count=0", () => {
    expect(buildPrestigeFlags({ prestigeCount: 0, awakened: false, activeTrialStar: 1 })).toEqual([
      "⚔️ ★1 試煉中",
      "🌱 蜜月中",
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
