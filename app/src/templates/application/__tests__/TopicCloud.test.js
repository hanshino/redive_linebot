// mysql + bottender mocks live in __tests__/setup.js (global setupFile).
const TopicCloud = require("../TopicCloud");
const { SURFACE, SEMANTIC, PALETTE } = require("../../common/theme");

const sampleRows = [
  { keyword: "凱留", count: 120 },
  { keyword: "課金", count: 64 },
  { keyword: "笑死", count: 33 },
  { keyword: "世界王", count: 21 },
  { keyword: "可可蘿", count: 18 },
];

// Recursively collect every string value under a given key.
function collectByKey(node, key, acc = []) {
  if (Array.isArray(node)) {
    node.forEach(n => collectByKey(n, key, acc));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === key && typeof v === "string") acc.push(v);
      collectByKey(v, key, acc);
    }
  }
  return acc;
}

describe("TopicCloud.generateWordCloudFlex", () => {
  it("returns a giga bubble", () => {
    const bubble = TopicCloud.generateWordCloudFlex({
      rows: sampleRows,
      title: "📊 我的文字雲",
      period: "近 30 天",
    });
    expect(bubble.type).toBe("bubble");
    expect(bubble.size).toBe("giga");
  });

  it("renders exactly one row per input keyword", () => {
    const bubble = TopicCloud.generateWordCloudFlex({
      rows: sampleRows,
      title: "📊 我的文字雲",
      period: "近 30 天",
    });
    // Each keyword text appears exactly once in the body.
    const texts = collectByKey(bubble.body, "text");
    sampleRows.forEach(r => {
      expect(texts.filter(t => t === r.keyword)).toHaveLength(1);
    });
  });

  it("prints the verbatim real count for every row", () => {
    const bubble = TopicCloud.generateWordCloudFlex({
      rows: sampleRows,
      title: "📊 我的文字雲",
      period: "近 30 天",
    });
    const texts = collectByKey(bubble.body, "text");
    sampleRows.forEach(r => {
      expect(texts).toContain(`${r.count}`);
    });
  });

  it("keeps every fill width between 0% and 100%", () => {
    const bubble = TopicCloud.generateWordCloudFlex({
      rows: sampleRows,
      title: "📊 我的文字雲",
      period: "近 30 天",
    });
    const widths = collectByKey(bubble.body, "width");
    expect(widths.length).toBeGreaterThan(0);
    widths.forEach(w => {
      const pct = Number(w.replace("%", ""));
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    });
  });

  it("gives the top row the maximum width (100%)", () => {
    const bubble = TopicCloud.generateWordCloudFlex({
      rows: sampleRows,
      title: "📊 我的文字雲",
      period: "近 30 天",
    });
    const widths = collectByKey(bubble.body, "width").map(w => Number(w.replace("%", "")));
    expect(Math.max(...widths)).toBe(100);
  });

  it("uses no hard-coded hex colors (every color is a theme token)", () => {
    const bubble = TopicCloud.generateWordCloudFlex({
      rows: sampleRows,
      title: "📊 我的文字雲",
      period: "近 30 天",
    });
    const allowed = new Set([
      ...Object.values(PALETTE),
      SURFACE.text,
      SURFACE.textMuted,
      SURFACE.bgMuted,
      SURFACE.dividerMuted,
      SEMANTIC.secondary.main,
      SEMANTIC.info.main,
      SEMANTIC.info.contrast,
    ]);
    const colors = [...collectByKey(bubble, "color"), ...collectByKey(bubble, "backgroundColor")];
    expect(colors.length).toBeGreaterThan(0);
    colors.forEach(c => {
      // Any literal hex that isn't a known theme token is a violation.
      if (/^#[0-9a-fA-F]{3,8}$/.test(c)) {
        expect(allowed.has(c)).toBe(true);
      }
    });
  });

  it("uses the passed liffUri verbatim (no hard-coded liff literal)", () => {
    const liffUri = "https://liff.line.me/INJECTED-ID/topics";
    const bubble = TopicCloud.generateWordCloudFlex({
      rows: sampleRows,
      title: "📊 我的文字雲",
      period: "近 30 天",
      liffUri,
    });
    const uris = collectByKey(bubble, "uri");
    expect(uris).toContain(liffUri);
    // No other liff.line.me literal sneaks in.
    const stringified = JSON.stringify(bubble);
    const matches = stringified.match(/liff\.line\.me/g) || [];
    expect(matches).toHaveLength(1);
  });

  it("stays under 10240 bytes for 12 rows (single giga bubble budget)", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      keyword: `關鍵字${i + 1}`,
      count: 1000 - i * 70,
    }));
    const bubble = TopicCloud.generateWordCloudFlex({
      rows,
      title: "📊 我的文字雲",
      period: "近 30 天",
      liffUri: "https://liff.line.me/some-id/topics",
    });
    expect(JSON.stringify(bubble).length).toBeLessThan(10240);
  });

  it("returns a no-data bubble for empty rows", () => {
    const bubble = TopicCloud.generateWordCloudFlex({
      rows: [],
      title: "📊 我的文字雲",
      period: "近 30 天",
    });
    expect(bubble.type).toBe("bubble");
    const texts = collectByKey(bubble, "text");
    expect(texts.join("")).toMatch(/還沒有/);
  });
});

describe("TopicCloud._internal.fillPct", () => {
  const { fillPct, FLOOR } = TopicCloud._internal;

  it("floors small counts at FLOOR and caps the max at 100", () => {
    expect(fillPct(120, 120)).toBe(100);
    expect(fillPct(1, 120)).toBeGreaterThanOrEqual(FLOOR);
    expect(fillPct(1, 120)).toBeLessThanOrEqual(100);
  });

  it("returns FLOOR when maxCount is zero/invalid", () => {
    expect(fillPct(0, 0)).toBe(FLOOR);
  });
});
