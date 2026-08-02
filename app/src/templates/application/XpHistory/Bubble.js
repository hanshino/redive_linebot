// LINE Flex bubble for `#經驗歷程` — shows today's XP summary and last event breakdown.

const moment = require("moment");

const COLORS = {
  cyanStart: "#00838F",
  cyanEnd: "#00ACC1",
  amber: "#FBBF24",
  amberDeep: "#F59E0B",
  amberText: "#FCD34D",
  amberTint: "#FFF7E6",
  amberTintDeep: "#B45309",
  white: "#FFFFFF",
  whiteOverlay: "#FFFFFF44",
  greenTint: "#E8F9EF",
  greenDeep: "#15803D",
  cyanTint: "#E0F7FA",
  redTint: "#FDECEC",
  redDeep: "#B91C1C",
  greyTint: "#EEF0F3",
  greyText: "#6B6577",
  deep: "#3A2800",
  muted: "#5A6B7F",
  warmBg: "#F8FAFB",
  // 鍊金之霧 converts exp into god stones — violet marks it as a different
  // currency, so it never reads as the amber "exp you kept".
  violetText: "#E9D5FF",
  violetMid: "#C4B5FD",
  violetTint: "#EDE9FE",
  violetDeep: "#5B21B6",
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// Stone counts run to four and occasionally five figures now.
const groupDigits = n => Number(n || 0).toLocaleString("en-US");

// 鍊金之霧: exp is diverted into 女神石 instead of levels. Fields may be absent
// on cached/older summaries — treat that as an ordinary day.
function alchemyState(today) {
  const exp = Number(today.alchemy_exp) || 0;
  const rate = Number(today.alchemy_rate) || null;
  if (exp <= 0) return null;
  return { exp, rate, stones: Number(today.alchemy_stones) || 0 };
}

function tierStatusLine(today) {
  const { tier, tier1_upper, raw_exp } = today;
  if (tier === 1) {
    return { text: `滿速 0–${tier1_upper} · 尚未進入遞減`, color: COLORS.amberText };
  }
  if (tier === 2) {
    return { text: `⚠ 已進入 tier 2 · XP ×0.30 · ${raw_exp} raw`, color: COLORS.amberText };
  }
  return { text: `⚠ tier 3 · 幾乎不漲 · ${raw_exp} raw`, color: "#FCA5A5" };
}

function barBox(segs) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "xs",
    height: "8px",
    contents: segs.map(s => ({
      type: "box",
      layout: "vertical",
      flex: s.flex,
      backgroundColor: s.color,
      cornerRadius: "md",
      contents: [],
    })),
  };
}

function progressBar(today, palette) {
  const { raw_exp, tier1_upper, tier2_upper } = today;
  const colors = palette || { t1: COLORS.amber, t2: COLORS.amberDeep };
  const scale = Math.max(raw_exp, Math.round(tier2_upper * 1.4));
  const t1 = Math.round((Math.min(raw_exp, tier1_upper) / scale) * 100);
  const t2 = Math.round(
    (Math.min(Math.max(0, raw_exp - tier1_upper), tier2_upper - tier1_upper) / scale) * 100
  );
  const t3 = Math.round((Math.max(0, raw_exp - tier2_upper) / scale) * 100);
  const rest = Math.max(0, 100 - t1 - t2 - t3);

  const segs = [];
  if (t1 > 0) segs.push({ flex: t1, color: colors.t1 });
  if (t2 > 0) segs.push({ flex: t2, color: colors.t2 });
  if (t3 > 0) segs.push({ flex: t3, color: "#9CA3AF" });
  if (rest > 0) segs.push({ flex: rest, color: COLORS.whiteOverlay });

  return barBox(segs);
}

// Diminishing returns still apply under 鍊金之霧 — the pipeline diverts exp to
// stones *after* the tier factor, so the tier bar predicts minting just as well
// as it predicts levelling. Same maths, violet paint.
const ALCHEMY_BAR = { t1: COLORS.violetText, t2: COLORS.violetMid };

// 「1 XP = 💎1」 reads like machinery; at 1:1 say it in words. Any other rate
// keeps the numeric form, which is the only way it stays true.
function alchemyRateText(rate) {
  if (!rate) return "經驗鍊成女神石";
  return rate === 1 ? "經驗 1:1 鍊成女神石" : `${rate} XP 鍊成 💎1`;
}

function chipBox(text, { bg, fg, border }) {
  const out = {
    type: "box",
    layout: "vertical",
    backgroundColor: bg,
    cornerRadius: "xl",
    paddingStart: "sm",
    paddingEnd: "sm",
    paddingTop: "2px",
    paddingBottom: "2px",
    flex: 0,
    contents: [{ type: "text", text, size: "xxs", color: fg, weight: "bold" }],
  };
  if (border) {
    out.borderColor = border;
    out.borderWidth = "1px";
  }
  return out;
}

function buildLastEventChips(ev) {
  if (!ev) return null;
  if (ev.base_xp == null) {
    return [chipBox("舊版資料 · 無乘數明細", { bg: COLORS.greyTint, fg: COLORS.greyText })];
  }
  const out = [];
  if (ev.honeymoon_mult > 1)
    out.push(
      chipBox(`🌱 蜜月 ×${ev.honeymoon_mult.toFixed(2)}`, {
        bg: COLORS.greenTint,
        fg: COLORS.greenDeep,
      })
    );
  if (ev.modifiers && ev.modifiers.active_trial_star) {
    out.push(
      chipBox(`★${ev.modifiers.active_trial_star} ×${ev.trial_mult.toFixed(2)}`, {
        bg: COLORS.amberTint,
        fg: COLORS.amberTintDeep,
      })
    );
  }
  if (ev.blessing1_mult > 1)
    out.push(
      chipBox(`🗣 暖流 ×${ev.blessing1_mult.toFixed(2)}`, {
        bg: COLORS.cyanTint,
        fg: COLORS.cyanStart,
      })
    );
  if (ev.group_bonus > 1)
    out.push(
      chipBox(`群組 ×${ev.group_bonus.toFixed(2)}`, { bg: COLORS.cyanTint, fg: COLORS.cyanStart })
    );
  if (ev.diminish_factor < 1) {
    const tier3 = ev.diminish_factor <= 0.05;
    out.push(
      chipBox(
        `已遞減 ×${ev.diminish_factor.toFixed(2)}`,
        tier3
          ? { bg: COLORS.redTint, fg: COLORS.redDeep, border: "#DC2626" }
          : { bg: COLORS.amberTint, fg: COLORS.amberTintDeep }
      )
    );
  }
  if (ev.permanent_mult > 1)
    out.push(chipBox(`永久 ×${ev.permanent_mult.toFixed(2)}`, { bg: "#F3E8FF", fg: "#6B21A8" }));
  // Under 鍊金之霧 the event's effective_exp is intact but goes to 女神石, not
  // levels. Say so, otherwise the number reads as level progress it never made.
  const rate = ev.modifiers?.weather?.effects?.exp_to_stone_rate;
  if (rate && !ev.weather_protected) {
    out.push(chipBox("💎 鍊成女神石", { bg: COLORS.violetTint, fg: COLORS.violetDeep }));
  } else if (rate) {
    out.push(chipBox("🛡 成長護符 · 正常入帳", { bg: COLORS.greenTint, fg: COLORS.greenDeep }));
  }
  if (out.length === 0) out.push(chipBox("正常獲取", { bg: COLORS.greyTint, fg: COLORS.greyText }));
  return out;
}

function buildLastEventCard(ev, groupName) {
  if (!ev) {
    return {
      type: "text",
      text: "今日尚無聊天紀錄",
      size: "sm",
      color: COLORS.muted,
      align: "center",
      margin: "md",
    };
  }
  const accent =
    ev.diminish_factor === 0.03
      ? "#DC2626"
      : ev.diminish_factor === 0.3
        ? COLORS.amberDeep
        : ev.base_xp == null
          ? "#9CA3AF"
          : COLORS.cyanEnd;

  const time = moment(ev.ts).format("HH:mm");
  const groupLabel = groupName || `…${(ev.group_id || "").slice(-4).toLowerCase()}`;
  const effColor =
    ev.effective_exp === 0
      ? "#DC2626"
      : ev.effective_exp < ev.raw_exp / 2
        ? COLORS.amberDeep
        : COLORS.deep;

  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    backgroundColor: COLORS.warmBg,
    cornerRadius: "md",
    contents: [
      { type: "box", layout: "vertical", width: "3px", backgroundColor: accent, contents: [] },
      {
        type: "box",
        layout: "vertical",
        paddingAll: "md",
        flex: 1,
        contents: [
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            contents: [
              {
                type: "text",
                contents: [
                  { type: "span", text: time, weight: "bold", color: COLORS.deep, size: "sm" },
                  { type: "span", text: `  ·  ${groupLabel}`, color: COLORS.muted, size: "xxs" },
                ],
                flex: 1,
              },
              {
                type: "text",
                contents: [
                  {
                    type: "span",
                    text: String(ev.raw_exp),
                    weight: "bold",
                    color: COLORS.muted,
                    size: "xs",
                  },
                  { type: "span", text: " → ", color: COLORS.muted, size: "xxs" },
                  {
                    type: "span",
                    text: String(ev.effective_exp),
                    weight: "bold",
                    color: effColor,
                    size: "md",
                  },
                ],
                align: "end",
                flex: 0,
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "xs",
            margin: "sm",
            contents: buildLastEventChips(ev),
          },
        ],
      },
    ],
  };
}

function buildHeader(today) {
  const { date, raw_exp, effective_exp, msg_count, active_trial_star } = today;
  const m = moment(date);
  const datePill = active_trial_star
    ? `⚔ ★${active_trial_star} 試煉中`
    : `${m.format("MM/DD")} ${WEEKDAYS[m.day()]}`;

  const alchemy = alchemyState(today);
  const status = alchemy
    ? {
        text: `🌫 鍊金之霧 · ${alchemyRateText(alchemy.rate)}`,
        color: COLORS.violetText,
      }
    : tierStatusLine(today);

  // On an alchemy day the day's yield is stones, not level exp — lead with the
  // stone count so the header never reads as "0 of something".
  const yieldLabel = alchemy ? "今日鍊成" : "累計實得";
  // 4-figure days are normal now and 5-figure ones happen, so separate the
  // thousands and step the size down before the suffix gets squeezed off.
  const stoneText = alchemy ? groupDigits(alchemy.stones) : "";
  const stoneSize = stoneText.length >= 7 ? "lg" : stoneText.length >= 5 ? "xl" : "xxl";
  const yieldSpans = alchemy
    ? [
        { type: "span", text: "💎 ", color: COLORS.violetText, size: "md" },
        {
          type: "span",
          text: stoneText,
          weight: "bold",
          color: COLORS.violetText,
          size: stoneSize,
        },
        {
          type: "span",
          // At 1:1 the XP figure is the same number again — spend the line on the
          // trade-off instead, which is the part the player cannot see elsewhere.
          text:
            alchemy.rate === 1
              ? "  今日經驗不累積等級"
              : `  由 ${groupDigits(alchemy.exp)} XP 鍊成`,
          color: COLORS.white,
          size: "xs",
        },
      ]
    : [
        {
          type: "span",
          text: String(effective_exp),
          weight: "bold",
          color: COLORS.amberText,
          size: "xxl",
        },
        { type: "span", text: ` / ${raw_exp} raw`, color: COLORS.white, size: "xs" },
      ];

  return {
    type: "box",
    layout: "vertical",
    paddingAll: "lg",
    background: {
      type: "linearGradient",
      angle: "135deg",
      startColor: COLORS.cyanStart,
      endColor: COLORS.cyanEnd,
    },
    backgroundColor: COLORS.cyanStart,
    contents: [
      {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        contents: [
          {
            type: "text",
            text: "📊 今日經驗",
            weight: "bold",
            size: "md",
            color: COLORS.white,
            flex: 1,
          },
          {
            type: "text",
            text: datePill,
            size: "xxs",
            color: COLORS.amberText,
            weight: "bold",
            align: "end",
            flex: 0,
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        margin: "md",
        alignItems: "flex-end",
        contents: [
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              { type: "text", text: yieldLabel, size: "xxs", color: COLORS.white },
              {
                type: "text",
                contents: yieldSpans,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            flex: 0,
            contents: [
              { type: "text", text: "訊息", size: "xxs", color: COLORS.white, align: "end" },
              {
                type: "text",
                text: String(msg_count),
                weight: "bold",
                color: COLORS.white,
                size: "lg",
                align: "end",
              },
            ],
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        margin: "md",
        contents: [
          alchemy ? progressBar(today, ALCHEMY_BAR) : progressBar(today),
          {
            type: "text",
            text: status.text,
            size: "xxs",
            color: status.color,
            weight: "bold",
            margin: "xs",
          },
        ],
      },
    ],
  };
}

function build({ summary, groupName, liffUri, prestigeLiffUri }) {
  const lastEventBlock = {
    type: "box",
    layout: "vertical",
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    contents: [
      { type: "text", text: "最近一則", size: "xxs", color: COLORS.muted, weight: "bold" },
      buildLastEventCard(summary.last_event, groupName),
    ],
  };

  const ctaBlock = {
    type: "box",
    layout: "vertical",
    paddingAll: "lg",
    paddingTop: "md",
    contents: [
      {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.amber,
        cornerRadius: "md",
        paddingTop: "md",
        paddingBottom: "md",
        action: { type: "uri", label: "查看完整歷程", uri: liffUri },
        contents: [
          {
            type: "text",
            text: "📊 查看完整歷程",
            size: "sm",
            color: COLORS.deep,
            weight: "bold",
            align: "center",
          },
        ],
      },
      {
        type: "text",
        text: "→ 轉生狀態",
        size: "xxs",
        color: COLORS.cyanStart,
        weight: "bold",
        align: "center",
        margin: "sm",
        action: { type: "uri", label: "轉生狀態", uri: prestigeLiffUri },
      },
    ],
  };

  return {
    altText: "📊 今日經驗歷程",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "none",
        paddingAll: "none",
        contents: [buildHeader(summary.today), lastEventBlock, ctaBlock],
      },
    },
  };
}

module.exports = { build };
