const { PALETTE, SEMANTIC, RARITY, SURFACE, HERO_SURFACE } = require("../../common/theme");
const i18n = require("../../../util/i18n");

const COLORS = {
  cyan700: PALETTE.cyan700,
  cyan600: SEMANTIC.primary.main,
  cyan500: SEMANTIC.primary.light,
  cyan400: PALETTE.cyan400,
  cyanBg: "#E0F7FA",

  amber500: SEMANTIC.secondary.main,
  amber400: SEMANTIC.secondary.light,
  amber300: PALETTE.amber300,
  amberBg: "#FFF7E6",

  green500: SEMANTIC.success.main,
  greenBg: "#E8F9EF",
  red500: SEMANTIC.danger.main,
  redBg: "#FDECEC",

  text: SURFACE.text,
  textMuted: SURFACE.textMuted,
  textDark: "#3A2800",
  track: "#F0F4F7",
  divider: "#EEF2F6",
  whiteOverlay: "#FFFFFF44",

  heroBgAlt: HERO_SURFACE.bgAlt,
  heroBgRaised: HERO_SURFACE.bgRaised,
  heroButton: HERO_SURFACE.bgButton,
  epic: RARITY.epic.main,
  epicSoft: "#D8B4FE",
  heroText: HERO_SURFACE.text,
  heroTextMuted: HERO_SURFACE.textMuted,
  tagCyanText: "#002A30",
  tagAmberText: "#3A2800",
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
      tagFg: "#FFFFFF",
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
  return { type: "text", contents: spans, size: "xxs" };
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
        size: "xxs",
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
        size: "xxs",
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
          size: "xxs",
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

const buildLinkPill = ({ label, action, size = "xxs", cornerRadius, alignItems, margin }) => {
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
