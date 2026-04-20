const { SEMANTIC } = require("../../common/theme");

const HERO_BG_ALT = "#12243A";
const HERO_TEXT = "#E8EEF4";
const HERO_MUTED = "#B0BEC5";
const AMBER_500 = SEMANTIC.secondary.main;
const AMBER_300 = "#FCD34D";
const AMBER_400 = SEMANTIC.secondary.light;
const CYAN_500 = SEMANTIC.primary.light;
const TAG_CYAN_TEXT = "#002A30";
const TAG_AMBER_TEXT = "#3A2800";

/**
 * Dark-luxury subscription panel — used by Profile (inline) and Subscription (standalone bubble).
 * Design: dark navy base + amber "gold hairline" at top + tag chip per card type.
 *
 * @param {Object} param0
 * @param {String} param0.key         "month" | "season"
 * @param {String} param0.titleText   e.g. "月卡"
 * @param {String} param0.expireText  e.g. "2026-05-01"
 * @param {String[]} param0.effects   pre-formatted effect row strings
 * @returns {Object} LINE Flex box
 */
exports.buildSubPanel = ({ key, titleText, expireText, effects }) => {
  const isSeason = key === "season";
  const tagBg = isSeason ? AMBER_400 : CYAN_500;
  const tagFg = isSeason ? TAG_AMBER_TEXT : TAG_CYAN_TEXT;

  const goldHairline = {
    type: "box",
    layout: "vertical",
    contents: [],
    height: "3px",
    background: {
      type: "linearGradient",
      angle: "90deg",
      startColor: AMBER_500,
      endColor: AMBER_300,
    },
    backgroundColor: AMBER_500,
  };

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
        color: HERO_MUTED,
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
      { type: "span", text: "◆ ", color: AMBER_400, weight: "bold" },
      { type: "span", text, color: HERO_TEXT },
    ],
    size: "xxs",
  }));

  const body = {
    type: "box",
    layout: "vertical",
    contents: [headRow, ...effectLines],
    backgroundColor: HERO_BG_ALT,
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
