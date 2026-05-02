const Profile = require("../Profile");

const baseInput = {
  displayName: "Tester",
  pictureUrl: "https://example.com/avatar.png",
  level: 42,
  expRate: 60,
  expCurrent: 1200,
  expNext: 2000,
  today: { gacha: false, janken: false, weeklyCompleted: 0 },
  signinDays: 7,
  subscriptionPanel: null,
  subscriptionBadge: null,
  xpHistoryUri: "https://liff.line.me/test-liff-id/xp-history",
};

function findNode(node, predicate) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const hit = predicate(node);
  if (hit) return hit;
  for (const value of Object.values(node)) {
    const found = findNode(value, predicate);
    if (found) return found;
  }
  return null;
}

const findText = (root, pred) =>
  findNode(root, n =>
    n.type === "text" && typeof n.text === "string" && pred(n.text) ? n.text : null
  );

describe("Me/Profile.build", () => {
  it("renders Lv pill without legacy range/rank text", () => {
    const bubble = Profile.build(baseInput);
    const pillText = findText(bubble, t => t.startsWith("Lv."));
    expect(pillText).toBe("Lv.42");
    // legacy "Rank #N" row must be gone
    const rankRow = findText(bubble, t => t.startsWith("Rank #"));
    expect(rankRow).toBeNull();
  });

  it("omits flag row when flags is empty / undefined", () => {
    const bubble = Profile.build({ ...baseInput, flags: [] });
    const flagRow = findText(bubble, t => /蜜月|試煉|覺醒|轉生/.test(t));
    expect(flagRow).toBeNull();
  });

  it("renders 蜜月 flag when fresh user", () => {
    const bubble = Profile.build({ ...baseInput, flags: ["🌱 蜜月 +20% XP"] });
    const flagRow = findText(bubble, t => t.includes("蜜月"));
    expect(flagRow).toBe("🌱 蜜月 +20% XP");
  });

  it("joins multiple flags with middle dot", () => {
    const bubble = Profile.build({
      ...baseInput,
      flags: ["⚔️ ★4 試煉中", "★★★ 轉生 3 次"],
    });
    const flagRow = findText(bubble, t => t.includes("試煉") || t.includes("轉生"));
    expect(flagRow).toBe("⚔️ ★4 試煉中 · ★★★ 轉生 3 次");
  });

  it("renders 覺醒者 flag without trial when awakened", () => {
    const bubble = Profile.build({ ...baseInput, level: 100, flags: ["✨ 覺醒者"] });
    const flagRow = findText(bubble, t => t.includes("覺醒"));
    expect(flagRow).toBe("✨ 覺醒者");
  });

  it("filters out falsy flag entries", () => {
    const bubble = Profile.build({
      ...baseInput,
      flags: ["★ 轉生 1 次", null, undefined, ""],
    });
    const flagRow = findText(bubble, t => t.includes("轉生"));
    expect(flagRow).toBe("★ 轉生 1 次");
  });

  it("renders 經驗歷程 CTA as a uri action pointing at the LIFF URL", () => {
    const bubble = Profile.build(baseInput);
    const action = findNode(bubble, n =>
      n.action && n.action.label === "查看經驗歷程" ? n.action : null
    );
    expect(action).toEqual({
      type: "uri",
      label: "查看經驗歷程",
      uri: baseInput.xpHistoryUri,
    });
  });

  describe("daily cap bar", () => {
    it("omits the daily-cap bar when caps are missing", () => {
      const bubble = Profile.build(baseInput);
      const capText = findText(bubble, t => t.includes("今日經驗區段"));
      expect(capText).toBeNull();
    });

    it("renders 滿速 zone when daily raw is below tier1", () => {
      const bubble = Profile.build({
        ...baseInput,
        dailyRaw: 250,
        tier1Upper: 400,
        tier2Upper: 1000,
      });
      const labelText = findText(bubble, t => t.startsWith("今日經驗"));
      expect(labelText).toBe("今日經驗區段");
      const valueText = findText(bubble, t => /^\d+\s*\/\s*\d+/.test(t));
      expect(valueText).toBe("250 / 400 · 🟢 滿速");
    });

    it("renders 30% zone when daily raw is between tier1 and tier2", () => {
      const bubble = Profile.build({
        ...baseInput,
        dailyRaw: 700,
        tier1Upper: 400,
        tier2Upper: 1000,
      });
      const valueText = findText(bubble, t => /^\d+\s*\/\s*\d+/.test(t));
      expect(valueText).toBe("700 / 1000 · 🟡 30%");
    });

    it("renders 3% 微量 zone without misleading divisor when daily raw exceeds tier2", () => {
      const bubble = Profile.build({
        ...baseInput,
        dailyRaw: 1500,
        tier1Upper: 400,
        tier2Upper: 1000,
      });
      const valueText = findText(bubble, t => t.includes("微量"));
      expect(valueText).toBe("1500 · 🔴 3% 微量");
    });

    it("uses expanded caps when blessings widen the tiers", () => {
      const bubble = Profile.build({
        ...baseInput,
        dailyRaw: 500,
        tier1Upper: 600, // blessing 4
        tier2Upper: 1200, // blessing 5
      });
      const valueText = findText(bubble, t => /^\d+\s*\/\s*\d+/.test(t));
      expect(valueText).toBe("500 / 600 · 🟢 滿速");
    });
  });
});
