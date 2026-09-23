// setup.js mocks i18n to echo keys; use the real locale so copy is asserted too.
jest.unmock("../../../../util/i18n");

const Me = require("../index");
const { COLORS } = require("../_shared");

const base = {
  displayName: "Tester",
  pictureUrl: "https://example.com/avatar.png",
  level: 42,
  expRate: 60,
  expCurrent: 1200,
  expNext: 2000,
  today: { gacha: false, janken: false, weeklyCompleted: 0 },
  signin: { streak: 7, monthCount: 5, daysInMonth: 31, total: 42 },
  signinUri: "https://liff.line.me/x/signin",
  xpHistoryUri: "https://liff.line.me/x/xp",
  characterCurrent: 10,
  characterTotal: 200,
  starProgress: 10,
  godStone: 100,
  paidStone: 0,
  janken: { win: 0, lose: 0, draw: 0, rate: null },
};

const MONTH = {
  key: "month",
  titleText: "月卡",
  expireText: "2026-11-02",
  effects: [
    { text: "+ 每日單抽次數 +1", exclusive: false },
    { text: "+ 每日寶石 +200", exclusive: false },
  ],
  paused: null,
};
const SEASON = {
  key: "season",
  titleText: "季卡",
  expireText: "2027-01-15",
  effects: [
    { text: "+ 每日單抽次數 +2", exclusive: false },
    { text: "+ 每日寶石 +500", exclusive: false },
  ],
  paused: null,
};
const PLUS = {
  key: "month_plus",
  titleText: "月卡 Plus",
  expireText: "2026-12-20",
  effects: [
    { text: "+ 每日寶石 +500", exclusive: false },
    { text: "+ 每日單抽次數 +2", exclusive: false },
    { text: "✨ 每日自動抽卡", exclusive: false },
    { text: "✨ 猜拳自動代打", exclusive: false },
    { text: "✨ 每日自動配對猜拳", exclusive: true },
  ],
  paused: null,
};
const MONTH_RESUME = { ...MONTH, expireText: "2027-02-10", paused: "resume" };
const MONTH_EXPIRE = { ...MONTH, paused: "expire" };

const RESUME = "⏸ Plus 到期後恢復發放";
const EXPIRE = "⏸ Plus 期間不發放，天數照常倒數";

function walk(node, visit) {
  if (Array.isArray(node)) return node.forEach(n => walk(n, visit));
  if (!node || typeof node !== "object") return;
  visit(node);
  Object.values(node).forEach(v => walk(v, visit));
}
const collect = (root, pred) => {
  const out = [];
  walk(root, n => pred(n) && out.push(n));
  return out;
};
const texts = root => collect(root, n => n.type === "text" || n.type === "span").map(n => n.text);
const tagBox = (root, title) =>
  collect(
    root,
    n =>
      n.type === "box" && n.contents?.length === 1 && n.contents[0].text === title && n.flex === 0
  )[0];

const build = cards => Me.buildBubbles({ ...base, subscriptionCards: cards });

describe("Me subscription rendering", () => {
  it("1. month only: inline in Profile, unchanged cyan look", () => {
    const bubbles = build([MONTH]);
    expect(bubbles).toHaveLength(2);
    expect(tagBox(bubbles[0], "月卡").backgroundColor).toBe(COLORS.cyan500);
    expect(texts(bubbles[0])).toContain("+ 每日寶石 +200");
    expect(texts(bubbles[0])).not.toContain("  Plus 專屬");
  });

  it("2. plus only: inline, epic tag, raised body, purple→gold hairline, exclusive span", () => {
    const [profile] = build([PLUS]);
    const tag = tagBox(profile, "月卡 Plus");
    expect(tag.backgroundColor).toBe(COLORS.epic);
    expect(tag.contents[0].color).toBe("#FFFFFF");
    expect(collect(profile, n => n.backgroundColor === COLORS.heroBgRaised)).toHaveLength(1);
    const bar = collect(profile, n => n.background?.startColor === COLORS.epic)[0];
    expect(bar.background.endColor).toBe(COLORS.amber300);
    expect(bar.backgroundColor).toBe(COLORS.epic); // fallback

    const exclusiveLine = collect(
      profile,
      n => n.type === "text" && n.contents?.some(s => s.text === "  Plus 專屬")
    );
    expect(exclusiveLine).toHaveLength(1);
    expect(exclusiveLine[0].contents[1].text).toBe("✨ 每日自動配對猜拳");
  });

  it("3a. plus + month (month outlives plus): resume copy, muted month, paused count", () => {
    const bubbles = build([PLUS, MONTH_RESUME]);
    expect(bubbles).toHaveLength(3);
    const [profile, sub] = bubbles;
    expect(texts(profile)).toContain("🎟 訂閱中 · 月卡 Plus + 月卡");
    const t = texts(sub);
    expect(t).toContain("2 張・1 張暫停");
    expect(t).toContain(RESUME);
    expect(t).not.toContain(EXPIRE);
    expect(t).not.toContain("+ 每日寶石 +200"); // paused card drops its effect rows
    const monthTag = tagBox(sub, "月卡");
    expect(monthTag.backgroundColor).toBe(COLORS.heroButton);
    expect(monthTag.contents[0].color).toBe(COLORS.heroTextMuted);
  });

  it("3b. plus + month (month ends first): expire copy", () => {
    const sub = build([PLUS, MONTH_EXPIRE])[1];
    const t = texts(sub);
    expect(t).toContain(EXPIRE);
    expect(t).not.toContain(RESUME);
    expect(t).toContain("2 張・1 張暫停");
  });

  it("4. plus + season: stacked, no paused count", () => {
    const sub = build([PLUS, SEASON])[1];
    const t = texts(sub);
    expect(t).toContain("2 張啟用中");
    expect(t).toContain("+ 每日寶石 +500");
    expect(tagBox(sub, "季卡").backgroundColor).toBe(COLORS.amber400);
    expect(t).not.toContain(RESUME);
    expect(t).not.toContain(EXPIRE);
  });

  it("5. plus + season + month: order kept, badge lists all names", () => {
    const [profile, sub] = build([PLUS, SEASON, MONTH_EXPIRE]);
    expect(texts(profile)).toContain("🎟 訂閱中 · 月卡 Plus + 季卡 + 月卡");
    const t = texts(sub);
    expect(t).toContain("3 張・1 張暫停");
    expect(t).toContain(EXPIRE);
    const order = t.filter(x => ["月卡 Plus", "季卡", "月卡"].includes(x));
    expect(order).toEqual(["月卡 Plus", "季卡", "月卡"]);
  });
});
