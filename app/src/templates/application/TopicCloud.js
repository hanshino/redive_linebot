// LINE Flex for the chat word-cloud feature (M5): the in-chat 排行條 view.
//
// LINE can't lay out a real cloud without rendering an image, so in-chat we use
// a ranked bar list (rank + keyword + proportional bar + real count). The real
// cloud lives in the LIFF page; the footer button is a one-tap entry there.
// Design DECIDED in docs/plans/2026-06-22-topic-heat-keywords-concept.md.
//
// All colors come from common/theme.js (no hard-coded hex). The LIFF URL is
// always built via getLiffUri (no hard-coded liff.line.me literal).

const { getLiffUri } = require("../common");
const { SURFACE, SEMANTIC, FEATURE, PALETTE } = require("../common/theme");

const ACCENT = FEATURE.chatLevel; // info / cyan — the word-cloud feature accent

// Bar-width mapping. Counts are very skewed (one or two giant terms, long tail
// of small ones), so a linear bar would crush the tail into invisibility. Floor
// every bar at FLOOR% and gamma-compress so small counts stay readable while the
// max still reaches 100%. The printed count stays the verbatim source of truth.
const FLOOR = 8;
const GAMMA = 0.7;

// Cyan ramp by rank: brightest at the top, fading down the list. Indices past
// the ramp reuse the last (lightest) stop. All values are theme PALETTE tokens.
const BAR_RAMP = [PALETTE.cyan700, PALETTE.cyan600, PALETTE.cyan500, PALETTE.cyan400];

function barColor(rankIndex) {
  return BAR_RAMP[Math.min(rankIndex, BAR_RAMP.length - 1)];
}

function rankColor(rankIndex) {
  // Gold for the podium (top 3), muted for the rest.
  return rankIndex < 3 ? SEMANTIC.secondary.main : SURFACE.textMuted;
}

function fillPct(count, maxCount) {
  if (!maxCount || maxCount <= 0) return FLOOR;
  const ratio = Math.max(0, Math.min(1, count / maxCount));
  return Math.round(FLOOR + (100 - FLOOR) * Math.pow(ratio, GAMMA));
}

function generateRow(row, rankIndex, maxCount) {
  const pct = fillPct(row.count, maxCount);

  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    spacing: "xs",
    contents: [
      {
        type: "box",
        layout: "baseline",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: `${rankIndex + 1}`,
            size: "sm",
            weight: "bold",
            color: rankColor(rankIndex),
            flex: 0,
          },
          {
            type: "text",
            text: row.keyword,
            size: "sm",
            weight: "bold",
            color: SURFACE.text,
            flex: 1,
          },
          {
            type: "text",
            text: `${row.count}`,
            size: "sm",
            color: SURFACE.textMuted,
            align: "end",
            flex: 0,
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        height: "6px",
        backgroundColor: SURFACE.bgMuted,
        cornerRadius: "3px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            width: `${pct}%`,
            height: "6px",
            backgroundColor: barColor(rankIndex),
            cornerRadius: "3px",
            contents: [],
          },
        ],
      },
    ],
  };
}

/**
 * 排行條 Flex（giga bubble）。空 rows 回傳一顆「尚無資料」bubble，
 * 呼叫端也可自行改回純文字。
 *
 * @param {object} params
 * @param {Array<{keyword: string, count: number}>} params.rows desc by count
 * @param {string} params.period   期間說明（如「近 30 天」）
 * @param {string} params.title    標題（如「📊 我的文字雲」）
 * @param {string} [params.subtitle] 副標（如「共 1,234 次發言用字」）
 * @param {string} [params.liffUri] footer 按鈕連結；省略則用 getLiffUri(full, /topics)
 * @returns {object} LINE Flex bubble
 */
exports.generateWordCloudFlex = ({ rows, period, title, subtitle, liffUri }) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return exports.generateNoDataFlex({ title, period });
  }

  const uri = liffUri || getLiffUri("full", "/topics");
  const maxCount = rows[0].count; // rows are desc by count
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const sub = subtitle || `${period}・前 ${rows.length} 名・累計 ${total} 次`;

  return {
    type: "bubble",
    size: "giga",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      backgroundColor: ACCENT.main,
      contents: [
        { type: "text", text: title, weight: "bold", size: "lg", color: ACCENT.contrast },
        { type: "text", text: sub, size: "xs", color: ACCENT.contrast, margin: "xs" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      contents: [
        {
          type: "text",
          text: "高頻用字排行",
          size: "xs",
          color: SURFACE.textMuted,
          weight: "bold",
        },
        { type: "separator", margin: "md", color: SURFACE.dividerMuted },
        ...rows.map((row, i) => generateRow(row, i, maxCount)),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: ACCENT.main,
          action: { type: "uri", label: "看完整文字雲 →", uri },
        },
      ],
    },
  };
};

/**
 * 尚無資料時的提示 bubble。
 * @param {object} [params]
 * @param {string} [params.title]
 * @param {string} [params.period]
 * @returns {object} LINE Flex bubble
 */
exports.generateNoDataFlex = ({ title = "文字雲", period = "近 30 天" } = {}) => ({
  type: "bubble",
  size: "kilo",
  body: {
    type: "box",
    layout: "vertical",
    paddingAll: "lg",
    spacing: "sm",
    contents: [
      { type: "text", text: title, weight: "bold", size: "md", color: SURFACE.text },
      {
        type: "text",
        text: `${period}還沒有足夠的發言用字，多聊聊天再來看看吧！`,
        size: "sm",
        color: SURFACE.textMuted,
        wrap: true,
      },
    ],
  },
});

exports.generateNoDataText = () => "目前還沒有足夠的發言用字，多聊聊天再來看看吧！";

exports._internal = { fillPct, barColor, rankColor, FLOOR, GAMMA, BAR_RAMP };
