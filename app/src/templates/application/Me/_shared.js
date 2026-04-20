const { PALETTE, SEMANTIC, SURFACE, HERO_SURFACE } = require("../../common/theme");

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

const buildSubPanel = ({ key, titleText, expireText, effects }) => {
  const isSeason = key === "season";
  const tagBg = isSeason ? COLORS.amber400 : COLORS.cyan500;
  const tagFg = isSeason ? COLORS.tagAmberText : COLORS.tagCyanText;

  const goldHairline = buildAccentBar({
    startColor: COLORS.amber500,
    endColor: COLORS.amber300,
    height: "3px",
  });

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

  const effectLines = effects.map(text => ({
    type: "text",
    contents: [
      { type: "span", text: "◆ ", color: COLORS.amber400, weight: "bold" },
      { type: "span", text, color: COLORS.heroText },
    ],
    size: "xxs",
  }));

  const body = {
    type: "box",
    layout: "vertical",
    contents: [headRow, ...effectLines],
    backgroundColor: COLORS.heroBgAlt,
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

module.exports = { COLORS, buildAccentBar, buildSubPanel };
