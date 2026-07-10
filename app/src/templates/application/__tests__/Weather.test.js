const { generateWeatherBubble } = require("../Weather");

function collect(node, key, acc = []) {
  if (Array.isArray(node)) node.forEach(n => collect(n, key, acc));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      if (k === key && typeof v === "string") acc.push(v);
      collect(v, key, acc);
    }
  return acc;
}

// CTA copy ("前往購買防護" / "查看經驗歷程") lives on the footer button's
// `action.label`, not a body `text` node — so it must be checked via both
// `text` and `label` collectors, not `text` alone.
function collectVisibleStrings(node) {
  return collect(node, "text").concat(collect(node, "label")).join("");
}

const LIFF = "https://liff.line.me/INJECTED/xp-history";
const debuff = {
  date: "2026-07-10",
  weather: {
    weather_key: "silent_fog",
    category: "debuff",
    name: "沉默霧氣",
    flavor_text: "霧氣吞掉句尾。",
    effects: { raw_xp_mult: 0.9 },
    protection_type: "defog",
    protection_name: "破霧鈴",
    protection_cost: 30,
  },
  protection: null,
  godStoneBalance: 860,
  liffUri: LIFF,
};

describe("generateWeatherBubble", () => {
  it("returns a bubble showing name, effect and a purchase CTA on an unprotected debuff", () => {
    const b = generateWeatherBubble(debuff);
    expect(b.type).toBe("bubble");
    const texts = collect(b, "text").join("");
    expect(texts).toContain("沉默霧氣");
    expect(texts).toContain("破霧鈴");
    expect(collectVisibleStrings(b)).toContain("前往購買防護");
    expect(collect(b, "uri")).toContain(LIFF);
  });

  it("shows 已防護 and drops the purchase CTA when protected", () => {
    const b = generateWeatherBubble({ ...debuff, protection: { protection_name: "破霧鈴" } });
    const texts = collect(b, "text").join("");
    expect(texts).toContain("已防護");
    expect(collectVisibleStrings(b)).not.toContain("前往購買防護");
  });

  it("shows no protection section on a buff day", () => {
    const b = generateWeatherBubble({
      ...debuff,
      weather: {
        weather_key: "mana_tailwind",
        category: "buff",
        name: "魔力順風",
        flavor_text: "順風。",
        effects: { effective_xp_mult: 1.1 },
      },
      protection: null,
    });
    const texts = collect(b, "text").join("");
    expect(texts).toContain("魔力順風");
    expect(collectVisibleStrings(b)).not.toContain("前往購買防護");
    expect(texts).not.toContain("破霧鈴");
  });
});
