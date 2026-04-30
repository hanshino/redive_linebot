const Status = require("../Status");

const baseInput = {
  displayName: "測試者",
  pictureUrl: "https://example.com/avatar.png",
  prestigeCount: 0,
  awakened: false,
  level: 42,
  expCurrent: 1800,
  expNext: 4200,
  expRate: 43,
  activeTrial: null,
  activeTrialProgress: 0,
  activeTrialRemainingDays: null,
  activeTrialDeadlineLabel: null,
  readyTrial: null,
  ownedBlessings: [],
  liffUri: "https://liff.line.me/test/prestige",
  liffUriSummary: "https://liff.line.me/test/prestige?view=summary",
};

function findText(node, predicate) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const f = findText(c, predicate);
      if (f) return f;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  if (
    (node.type === "text" || node.type === "span") &&
    typeof node.text === "string" &&
    predicate(node.text)
  )
    return node.text;
  for (const v of Object.values(node)) {
    const f = findText(v, predicate);
    if (f) return f;
  }
  return null;
}

function findActionUri(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const f = findActionUri(c);
      if (f) return f;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  if (node.action && node.action.type === "uri") return node.action.uri;
  for (const v of Object.values(node)) {
    const f = findActionUri(v);
    if (f) return f;
  }
  return null;
}

describe("Prestige/Status._internal", () => {
  const { resolveScenario, buildFlag, formatTrialRestriction } = Status._internal;

  it("classifies honeymoon when prestigeCount=0 and no trial", () => {
    expect(resolveScenario({ awakened: false, prestigeCount: 0 })).toBe("honeymoon");
  });
  it("classifies active when activeTrial present", () => {
    expect(resolveScenario({ awakened: false, prestigeCount: 1, activeTrial: { id: 1 } })).toBe(
      "active"
    );
  });
  it("classifies ready when readyTrial present", () => {
    expect(resolveScenario({ awakened: false, prestigeCount: 2, readyTrial: { star: 3 } })).toBe(
      "ready"
    );
  });
  it("classifies awakened over everything else", () => {
    expect(
      resolveScenario({
        awakened: true,
        prestigeCount: 5,
        activeTrial: { id: 1 },
        readyTrial: { star: 5 },
      })
    ).toBe("awakened");
  });
  it("classifies between-cycles when prestige > 0 with no trial", () => {
    expect(resolveScenario({ awakened: false, prestigeCount: 2 })).toBe("between");
  });

  it("formats xp_multiplier restriction", () => {
    expect(formatTrialRestriction({ type: "xp_multiplier", value: 0.7 })).toEqual({
      label: "XP",
      value: "×0.7",
    });
  });
  it("formats cooldown_shift_multiplier restriction", () => {
    expect(formatTrialRestriction({ type: "cooldown_shift_multiplier", value: 1.33 })).toEqual({
      label: "冷卻",
      value: "×1.33",
    });
  });
  it("formats group_bonus_disabled restriction", () => {
    expect(formatTrialRestriction({ type: "group_bonus_disabled" })).toEqual({
      label: "群組",
      value: "加成失效",
    });
  });
  it("returns null for none restriction", () => {
    expect(formatTrialRestriction({ type: "none" })).toBeNull();
  });

  it("builds honeymoon flag", () => {
    expect(buildFlag({ scenario: "honeymoon", prestigeCount: 0 })).toBe("🌱 蜜月期");
  });
  it("builds awakened flag", () => {
    expect(buildFlag({ scenario: "awakened", prestigeCount: 5 })).toBe(
      "★★★★★ 轉生 5 次 · 試煉旅程已完成"
    );
  });
  it("builds active trial flag with star + count", () => {
    expect(
      buildFlag({
        scenario: "active",
        prestigeCount: 1,
        activeTrial: { star: 3 },
      })
    ).toBe("⚔️ ★3 試煉中  ·  ★ 轉生 1 次");
  });
});

describe("Prestige/Status.build", () => {
  describe("honeymoon scenario", () => {
    const flex = Status.build(baseInput);

    it("returns altText with displayName", () => {
      expect(flex.altText).toBe("測試者 的轉生狀態");
    });
    it("renders 🌱 蜜月期 hero flag", () => {
      expect(findText(flex.contents, t => t.includes("蜜月期"))).toBe("🌱 蜜月期");
    });
    it("renders 蜜月加成 chip with +20%", () => {
      expect(findText(flex.contents, t => t === "+20%")).toBe("+20%");
    });
    it("shows 0 / 7 blessing counter", () => {
      expect(findText(flex.contents, t => t === "0")).toBe("0");
      expect(findText(flex.contents, t => /\/ 7/.test(t))).toBe(" / 7");
    });
    it("renders disabled footer (no action)", () => {
      expect(findText(flex.contents, t => t.includes("解鎖試煉"))).toBe("達 Lv.100 解鎖試煉");
      expect(findActionUri(flex.contents)).toBeNull();
    });
  });

  describe("in-trial scenario", () => {
    const flex = Status.build({
      ...baseInput,
      prestigeCount: 1,
      level: 73,
      expCurrent: 4300,
      expNext: 10100,
      expRate: 42,
      activeTrial: {
        id: 3,
        star: 3,
        display_name: "律動",
        required_exp: 12500,
        restriction_meta: { type: "cooldown_shift_multiplier", value: 1.33 },
      },
      activeTrialProgress: 4500,
      activeTrialRemainingDays: 41,
      activeTrialDeadlineLabel: "06/11",
      ownedBlessings: [
        { slug: "language_gift", display_name: "語言天賦" },
        { slug: "swift_tongue", display_name: "迅雷語速" },
        { slug: "ember_afterglow", display_name: "燃燒餘熱" },
      ],
    });

    it("renders trial card heading with star + name", () => {
      expect(findText(flex.contents, t => t.includes("律動"))).toBe("⚔️ ★3 律動");
    });
    it("renders cooldown ×1.33 restriction label", () => {
      expect(findText(flex.contents, t => t === " ×1.33")).toBe(" ×1.33");
    });
    it("renders progress with locale formatting", () => {
      expect(findText(flex.contents, t => t === "4,500")).toBe("4,500");
      expect(findText(flex.contents, t => t === " / 12,500")).toBe(" / 12,500");
    });
    it("renders deadline label", () => {
      expect(findText(flex.contents, t => t.includes("至 06/11"))).toBe(" 天 · 至 06/11");
    });
    it("renders 了解試煉詳情 footer with action uri", () => {
      expect(findText(flex.contents, t => t === "了解試煉詳情")).toBe("了解試煉詳情");
      expect(findActionUri(flex.contents)).toBe(baseInput.liffUri);
    });
    it("renders blessing rows with real seeder descriptions", () => {
      expect(findText(flex.contents, t => t === "🗣 語言天賦")).toBe("🗣 語言天賦");
      expect(findText(flex.contents, t => t.startsWith("單句基礎"))).toBe("單句基礎 XP +8%");
    });
  });

  describe("ready-to-prestige scenario", () => {
    const flex = Status.build({
      ...baseInput,
      prestigeCount: 2,
      level: 100,
      expCurrent: 14000,
      expNext: 0,
      expRate: 100,
      readyTrial: { star: 4, display_name: "孤鳴" },
      ownedBlessings: [
        { slug: "language_gift", display_name: "語言天賦" },
        { slug: "swift_tongue", display_name: "迅雷語速" },
        { slug: "ember_afterglow", display_name: "燃燒餘熱" },
        { slug: "whispering", display_name: "絮語之心" },
      ],
    });

    it("renders 試煉通過 hero flag with prestige stars", () => {
      expect(findText(flex.contents, t => t.includes("試煉通過"))).toBe(
        "🪄 試煉通過 · 可立即轉生  ·  ★★ 轉生 2 次"
      );
    });
    it("renders ready trial card with ✓", () => {
      expect(findText(flex.contents, t => t.includes("孤鳴 已通過"))).toBe("🪄 ★4 孤鳴 已通過");
    });
    it("renders 立即轉生 amber CTA", () => {
      expect(findText(flex.contents, t => t === "🪄 立即轉生")).toBe("🪄 立即轉生");
      expect(findActionUri(flex.contents)).toBe(baseInput.liffUri);
    });
    it("blessing counter shows 4 / 7 · 下一個 +1", () => {
      expect(findText(flex.contents, t => t.includes("下一個"))).toBe(" / 7  ·  下一個 +1");
    });
  });

  describe("awakened scenario", () => {
    const flex = Status.build({
      ...baseInput,
      prestigeCount: 5,
      awakened: true,
      level: 88,
      expCurrent: 8400,
      expNext: 12800,
      expRate: 66,
      ownedBlessings: [
        { slug: "language_gift", display_name: "語言天賦" },
        { slug: "swift_tongue", display_name: "迅雷語速" },
        { slug: "ember_afterglow", display_name: "燃燒餘熱" },
        { slug: "whispering", display_name: "絮語之心" },
        { slug: "rhythm_spring", display_name: "節律之泉" },
        { slug: "star_guard", display_name: "群星加護" },
        { slug: "greenhouse", display_name: "溫室之語" },
      ],
    });

    it("renders ✨ 覺醒者 level pill", () => {
      expect(findText(flex.contents, t => t === "✨ 覺醒者")).toBe("✨ 覺醒者");
    });
    it("renders all-five-stars completed flag", () => {
      expect(findText(flex.contents, t => t.includes("試煉旅程"))).toBe(
        "★★★★★ 轉生 5 次 · 試煉旅程已完成"
      );
    });
    it("renders 全收集 counter with green ✓", () => {
      expect(findText(flex.contents, t => t === "✓ 7")).toBe("✓ 7");
      expect(findText(flex.contents, t => t.includes("全收集"))).toBe(" / 7  ·  全收集");
    });
    it("renders 了解祝福組合 footer with summary URI", () => {
      expect(findText(flex.contents, t => t === "了解祝福組合")).toBe("了解祝福組合");
      expect(findActionUri(flex.contents)).toBe(baseInput.liffUriSummary);
    });
  });
});
