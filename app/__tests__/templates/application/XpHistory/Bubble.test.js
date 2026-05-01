const Bubble = require("../../../../src/templates/application/XpHistory/Bubble");

const baseSummary = {
  today: {
    date: "2026-05-01",
    raw_exp: 327,
    effective_exp: 327,
    msg_count: 63,
    daily_raw: 327,
    tier: 1,
    tier1_upper: 600,
    tier2_upper: 1000,
    honeymoon_active: true,
    active_trial_star: null,
  },
  last_event: {
    ts: "2026-05-01T14:27:48",
    group_id: "Cabc123",
    raw_exp: 5,
    effective_exp: 6,
    base_xp: 5.0,
    cooldown_rate: 1.0,
    group_bonus: 1.1,
    blessing1_mult: 1.0,
    honeymoon_mult: 1.2,
    diminish_factor: 1.0,
    trial_mult: 1.0,
    permanent_mult: 1.0,
    modifiers: { honeymoon: true, active_trial_star: null, blessings: [] },
  },
};

describe("XpHistory Bubble", () => {
  test("returns altText + flex contents (carousel-friendly)", () => {
    const out = Bubble.build({
      summary: baseSummary,
      groupName: "夜貓子閒聊",
      liffUri: "https://liff.line.me/2000-xp-history/xp-history",
      prestigeLiffUri: "https://liff.line.me/2000-prestige/prestige",
    });
    expect(out).toHaveProperty("altText");
    expect(out).toHaveProperty("contents");
    expect(out.contents.type).toBe("bubble");
  });

  test("tier 2 → status line mentions tier 2", () => {
    const summary = JSON.parse(JSON.stringify(baseSummary));
    summary.today.tier = 2;
    summary.today.daily_raw = 840;
    const out = Bubble.build({ summary, groupName: null, liffUri: "u", prestigeLiffUri: "p" });
    const text = JSON.stringify(out.contents);
    expect(text).toMatch(/tier 2/);
  });

  test("tier 3 → status line mentions tier 3", () => {
    const summary = JSON.parse(JSON.stringify(baseSummary));
    summary.today.tier = 3;
    summary.today.daily_raw = 1540;
    const out = Bubble.build({ summary, groupName: null, liffUri: "u", prestigeLiffUri: "p" });
    expect(JSON.stringify(out.contents)).toMatch(/tier 3/);
  });

  test("active trial → header pill shows ⚔ ★N 試煉中", () => {
    const summary = JSON.parse(JSON.stringify(baseSummary));
    summary.today.active_trial_star = 5;
    const out = Bubble.build({ summary, groupName: null, liffUri: "u", prestigeLiffUri: "p" });
    expect(JSON.stringify(out.contents)).toMatch(/★5 試煉中/);
  });

  test("last_event with no breakdown columns shows '舊版資料' chip", () => {
    const summary = JSON.parse(JSON.stringify(baseSummary));
    summary.last_event.base_xp = null;
    summary.last_event.blessing1_mult = null;
    summary.last_event.honeymoon_mult = null;
    summary.last_event.diminish_factor = null;
    summary.last_event.trial_mult = null;
    summary.last_event.permanent_mult = null;
    const out = Bubble.build({ summary, groupName: null, liffUri: "u", prestigeLiffUri: "p" });
    expect(JSON.stringify(out.contents)).toMatch(/舊版資料/);
  });

  test("no last event → renders empty-state placeholder", () => {
    const summary = JSON.parse(JSON.stringify(baseSummary));
    summary.last_event = null;
    const out = Bubble.build({ summary, groupName: null, liffUri: "u", prestigeLiffUri: "p" });
    expect(JSON.stringify(out.contents)).toMatch(/今日尚無|還沒|尚未/);
  });

  test("CTA button URI is the LIFF URI", () => {
    const out = Bubble.build({
      summary: baseSummary,
      groupName: null,
      liffUri: "https://liff.line.me/X/xp-history",
      prestigeLiffUri: "https://liff.line.me/Y/prestige",
    });
    expect(JSON.stringify(out.contents)).toContain("https://liff.line.me/X/xp-history");
  });
});
