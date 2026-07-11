const { SEMANTIC, SURFACE } = require("../common/theme");
const { describeEffects } = require("../../service/chatXp/weatherEffects");

const ACCENT = { debuff: SEMANTIC.warning, buff: SEMANTIC.success };

function textNode(text, extra = {}) {
  return { type: "text", text, wrap: true, size: "sm", color: SURFACE.text, ...extra };
}

const MUTED_NOTE = { margin: "md", size: "xs", color: SURFACE.textMuted };

/**
 * @param {object} p
 * @param {string} p.date
 * @param {object} p.weather DB 原始欄位
 * @param {object|null} p.protection 使用者當日防護列或 null
 * @param {number} p.godStoneBalance
 * @param {string} p.liffUri 由 controller 傳入的 LIFF 連結
 * @param {boolean} [p.purchaseEnabled=true] 防護購買總開關；關閉時隱藏購買相關文案/CTA
 */
function generateWeatherBubble({
  date,
  weather,
  protection,
  godStoneBalance,
  liffUri,
  purchaseEnabled = true,
}) {
  const accent = ACCENT[weather.category] || SEMANTIC.success;
  const isDebuff = weather.category === "debuff";
  const isProtected = isDebuff && Boolean(protection);
  const effectText = describeEffects(weather.effects).join("、") || "無";

  const body = [
    textNode(weather.name, { weight: "bold", size: "lg" }),
    textNode(weather.flavor_text, { size: "xs", color: SURFACE.textMuted, margin: "sm" }),
    { type: "separator", margin: "md", color: SURFACE.dividerMuted },
    textNode(`效果：${effectText}`, {
      margin: "md",
      color: isProtected ? SURFACE.textDisabled : SURFACE.text,
      decoration: isProtected ? "line-through" : "none",
    }),
  ];

  if (isDebuff) {
    if (isProtected) {
      body.push(
        textNode(`已防護 · ${protection.protection_name}（今日有效）`, {
          margin: "md",
          size: "xs",
          color: SEMANTIC.info.main,
          weight: "bold",
        })
      );
    } else if (purchaseEnabled) {
      body.push(
        textNode(
          `防護：${weather.protection_name} · ${weather.protection_cost} 女神石`,
          MUTED_NOTE
        ),
        textNode(`尚未防護（你有 ${godStoneBalance} 女神石）`, {
          size: "xs",
          color: accent.main,
          weight: "bold",
        })
      );
    } else {
      body.push(textNode("今日為減益天氣。", MUTED_NOTE));
    }
  } else {
    body.push(textNode("今日為增益天氣，無需防護。", MUTED_NOTE));
  }

  const needsProtection = isDebuff && !isProtected && purchaseEnabled;
  const cta = needsProtection ? "前往購買防護" : "查看經驗歷程";

  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: accent.main,
      paddingAll: "md",
      contents: [
        { type: "text", text: "今日天氣", color: accent.contrast, weight: "bold", size: "sm" },
        {
          type: "text",
          text: date,
          color: accent.contrast,
          size: "xs",
          align: "end",
          gravity: "center",
        },
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "lg", spacing: "sm", contents: body },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        {
          type: "button",
          style: needsProtection ? "primary" : "link",
          color: needsProtection ? accent.main : SEMANTIC.info.main,
          height: "sm",
          action: { type: "uri", label: cta, uri: liffUri },
        },
      ],
    },
  };
}

module.exports = { generateWeatherBubble };
