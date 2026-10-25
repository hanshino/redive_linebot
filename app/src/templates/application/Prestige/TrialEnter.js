// LINE Flex bubble announcing that a player has just entered a prestige trial.
// One bubble per trial slug; visual system mirrors the Lv.50 CTA palette.

const { PALETTE, SURFACE, TINT, PRESTIGE } = require("../../common/theme");
const PRESTIGE_DEEP = PRESTIGE.deep;
const PRESTIGE_PURPLE = PRESTIGE.purple;
const SUBTITLE_GRAY = SURFACE.textMuted;
const BODY_DIVIDER = SURFACE.dividerMuted;

const THEMES = {
  departure: {
    heroBg: TINT.slate.main,
    sloganColor: TINT.slate.bg,
    chipBg: TINT.slate.bg,
    chipBorder: TINT.slate.border,
    chipFg: TINT.slate.ink,
    slogan: "第一步，從這裡踏出。",
    restriction: "限制 · 無限制 · 暖身",
    reward: "獎勵 · 過關 → 基礎強化",
    isFinal: false,
  },
  hardship: {
    heroBg: TINT.blue.main,
    sloganColor: TINT.blue.bg,
    chipBg: TINT.blue.bg,
    chipBorder: TINT.blue.border,
    chipFg: TINT.blue.ink,
    slogan: "鈍刃磨亮，需以時日。",
    restriction: "限制 · 期間 XP ×0.7",
    reward: "獎勵 · 過關 → 永久 +10% XP",
    isFinal: false,
  },
  rhythm: {
    heroBg: TINT.green.main,
    sloganColor: TINT.green.bg,
    chipBg: TINT.green.bg,
    chipBorder: TINT.green.border,
    chipFg: TINT.green.ink,
    slogan: "順流者勝，逆潮者亡。",
    restriction: "限制 · 冷卻 ×1.33",
    reward: "獎勵 · 過關 → 中段 tier 上升",
    isFinal: false,
  },
  solitude: {
    heroBg: TINT.purple.main,
    sloganColor: TINT.purple.bg,
    chipBg: TINT.purple.bg,
    chipBorder: TINT.purple.border,
    chipFg: TINT.purple.ink,
    slogan: "獨身入谷，只聞己聲。",
    restriction: "限制 · 群組加成失效",
    reward: "獎勵 · 過關 → 群組加成翻倍",
    isFinal: false,
  },
  awakening: {
    heroBg: TINT.amber.main,
    sloganColor: TINT.amber.bg,
    chipBg: TINT.amber.bg,
    chipBorder: TINT.amber.border,
    chipFg: TINT.amber.ink,
    slogan: "焚身為炬，方見天明。",
    restriction: "限制 · 期間 XP ×0.5",
    reward: "獎勵 · 永久 +15% XP · 覺醒態",
    isFinal: true,
  },
};

function buildHero(theme, star, trialName) {
  const contents = [];
  if (theme.isFinal) {
    contents.push({
      type: "box",
      layout: "horizontal",
      spacing: "xs",
      contents: [
        {
          type: "text",
          text: "最終試煉",
          color: theme.sloganColor,
          size: "xs",
          weight: "bold",
          flex: 0,
        },
        { type: "filler" },
      ],
    });
  }
  contents.push({
    type: "text",
    text: `⭐ ×${star}  ${trialName}`,
    color: PALETTE.white,
    weight: "bold",
    size: "md",
    wrap: true,
  });
  contents.push({
    type: "text",
    text: theme.slogan,
    color: theme.sloganColor,
    size: "xs",
    wrap: true,
  });
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: theme.heroBg,
    paddingAll: "12px",
    paddingTop: "14px",
    spacing: "xs",
    contents,
  };
}

function buildBody(theme, displayName, deadline) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: PALETTE.white,
    paddingAll: "12px",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: `${displayName} 踏入了試煉`,
        color: PRESTIGE_DEEP,
        weight: "bold",
        size: "xs",
        wrap: true,
      },
      {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: theme.chipBg,
            borderColor: theme.chipBorder,
            borderWidth: "1px",
            cornerRadius: "4px",
            paddingAll: "6px",
            contents: [
              {
                type: "text",
                text: theme.restriction,
                color: theme.chipFg,
                size: "xs",
                wrap: true,
              },
            ],
          },
          {
            type: "text",
            text: theme.reward,
            color: PRESTIGE_PURPLE,
            size: "xs",
            wrap: true,
          },
        ],
      },
      { type: "separator", color: BODY_DIVIDER },
      {
        type: "text",
        text: `60 天為期 · 至 ${deadline}`,
        color: SUBTITLE_GRAY,
        size: "xs",
        wrap: true,
      },
    ],
  };
}

/**
 * Build the trial-enter flex bubble.
 *
 * @param {Object} input
 * @param {String} input.displayName  player nickname
 * @param {String} input.slug         trial slug (departure | hardship | rhythm | solitude | awakening)
 * @param {Number} input.star         1–5
 * @param {String} input.trialName    Chinese display name (e.g. 啟程)
 * @param {String} input.deadline     YYYY-MM-DD
 * @returns {{ altText: String, contents: Object }}
 */
exports.build = ({ displayName, slug, star, trialName, deadline }) => {
  const theme = THEMES[slug] || THEMES.departure;
  const safeName = displayName || "玩家";
  return {
    altText: `${safeName} 踏入了 ★${star} ${trialName} 試煉`,
    contents: {
      type: "bubble",
      size: "deca",
      hero: buildHero(theme, star, trialName),
      body: buildBody(theme, safeName, deadline),
      styles: {
        hero: { separator: false },
        body: { separator: false },
      },
    },
  };
};
