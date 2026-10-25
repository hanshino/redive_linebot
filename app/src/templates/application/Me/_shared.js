const { PALETTE, RARITY, SURFACE, HERO_SURFACE, TINT, OVERLAY } = require("../../common/theme");
const i18n = require("../../../util/i18n");

// Me 卡片為深色舞台底，鮮亮色一律取 PALETTE（SEMANTIC.main 為淺底文字用的深色版）
const COLORS = {
  cyan700: PALETTE.cyan700,
  cyan600: PALETTE.cyan600,
  cyan500: PALETTE.cyan500,
  cyan400: PALETTE.cyan400,
  cyanBg: TINT.cyan.bg,

  amber500: PALETTE.amber500,
  amber400: PALETTE.amber400,
  amber300: PALETTE.amber300,
  amberBg: TINT.gold.bg,

  green500: PALETTE.green500,
  greenBg: TINT.mint.bg,
  red500: PALETTE.red500,
  redBg: TINT.red.bg,

  white: PALETTE.white,
  text: SURFACE.text,
  textMuted: SURFACE.textMuted,
  textDark: TINT.amber.deep,
  track: SURFACE.bgAlt,
  divider: SURFACE.dividerMuted,
  whiteOverlay: OVERLAY.onColorSoft,

  heroBgAlt: HERO_SURFACE.bgAlt,
  heroBgRaised: HERO_SURFACE.bgRaised,
  heroButton: HERO_SURFACE.bgButton,
  epic: RARITY.epic.main,
  epicSoft: TINT.violet.border,
  heroText: HERO_SURFACE.text,
  heroTextMuted: HERO_SURFACE.textMuted,
  tagCyanText: TINT.cyan.ink,
  tagAmberText: TINT.amber.deep,
};

const buildAccentBar = ({ startColor, endColor, height = "4px" }) => ({
  type: "box",
  layout: "vertical",
  contents: [],
  height,
  background: {
    type: "linearGradient",
    angle: "90deg",
    startColor,
    endColor,
  },
  backgroundColor: startColor,
});

// Three looks: normal (month/season), Plus (upper tier), paused (overridden by Plus).
// Flex has no opacity, so "paused" is expressed purely through muted colors.
function panelStyle(key, paused) {
  if (paused) {
    return {
      hairline: { startColor: COLORS.heroButton, endColor: COLORS.heroButton },
      bodyBg: COLORS.heroBgAlt,
      tagBg: COLORS.heroButton,
      tagFg: COLORS.heroTextMuted,
    };
  }
  if (key === "month_plus") {
    return {
      hairline: { startColor: COLORS.epic, endColor: COLORS.amber300 },
      bodyBg: COLORS.heroBgRaised,
      tagBg: COLORS.epic,
      tagFg: PALETTE.white,
    };
  }
  const isSeason = key === "season";
  return {
    hairline: { startColor: COLORS.amber500, endColor: COLORS.amber300 },
    bodyBg: COLORS.heroBgAlt,
    tagBg: isSeason ? COLORS.amber400 : COLORS.cyan500,
    tagFg: isSeason ? COLORS.tagAmberText : COLORS.tagCyanText,
  };
}

const PAUSED_TEXT_KEY = {
  resume: "message.subscribe.paused_by_plus_resume",
  expire: "message.subscribe.paused_by_plus_expire",
};

const buildEffectLine = ({ text, exclusive }) => {
  const spans = [
    { type: "span", text: "◆ ", color: COLORS.amber400, weight: "bold" },
    { type: "span", text, color: COLORS.heroText },
  ];
  if (exclusive) {
    spans.push({
      type: "span",
      text: `  ${i18n.__("message.subscribe.effect_exclusive_plus")}`,
      color: COLORS.epicSoft,
      weight: "bold",
    });
  }
  return { type: "text", contents: spans, size: "xs" };
};

const buildSubPanel = ({ key, titleText, expireText, effects = [], paused = null }) => {
  const { hairline, bodyBg, tagBg, tagFg } = panelStyle(key, paused);

  const goldHairline = buildAccentBar({ ...hairline, height: "3px" });

  const tagChip = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: titleText,
        size: "xs",
        color: tagFg,
        weight: "bold",
        align: "center",
      },
    ],
    backgroundColor: tagBg,
    cornerRadius: "sm",
    paddingStart: "sm",
    paddingEnd: "sm",
    paddingTop: "2px",
    paddingBottom: "2px",
    flex: 0,
  };

  const headRow = {
    type: "box",
    layout: "horizontal",
    contents: [
      tagChip,
      {
        type: "text",
        text: `${expireText} 到期`,
        size: "xs",
        color: COLORS.heroTextMuted,
        gravity: "center",
        align: "end",
        flex: 1,
      },
    ],
    spacing: "sm",
    alignItems: "center",
  };

  const lines = PAUSED_TEXT_KEY[paused]
    ? [
        {
          type: "text",
          text: i18n.__(PAUSED_TEXT_KEY[paused]),
          size: "xs",
          color: COLORS.heroTextMuted,
          wrap: true,
        },
      ]
    : effects.map(buildEffectLine);

  const body = {
    type: "box",
    layout: "vertical",
    contents: [headRow, ...lines],
    backgroundColor: bodyBg,
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    paddingBottom: "md",
    spacing: "xs",
  };

  return {
    type: "box",
    layout: "vertical",
    contents: [goldHairline, body],
    spacing: "none",
  };
};

const buildLinkPill = ({ label, action, size = "xs", cornerRadius, alignItems, margin }) => {
  const pill = {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: label,
        size,
        color: COLORS.cyan700,
        weight: "bold",
        flex: 1,
        gravity: "center",
      },
      {
        type: "text",
        text: "›",
        size: "md",
        color: COLORS.cyan700,
        weight: "bold",
        align: "end",
        flex: 0,
      },
    ],
    backgroundColor: COLORS.cyanBg,
    paddingStart: "md",
    paddingEnd: "md",
    paddingTop: "sm",
    paddingBottom: "sm",
  };
  if (cornerRadius) pill.cornerRadius = cornerRadius;
  if (alignItems) pill.alignItems = alignItems;
  if (margin) pill.margin = margin;
  if (action) pill.action = action;
  return pill;
};

module.exports = { COLORS, buildAccentBar, buildSubPanel, buildLinkPill };
