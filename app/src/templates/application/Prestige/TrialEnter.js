// LINE Flex bubble announcing that a player has just entered a prestige trial.
// One bubble per trial slug; visual system mirrors the Lv.50 CTA palette.

const PRESTIGE_DEEP = "#2A1F4D";
const PRESTIGE_PURPLE = "#3B2A6B";
const SUBTITLE_GRAY = "#9B9BA3";
const BODY_DIVIDER = "#EEEEF1";

const THEMES = {
  departure: {
    heroBg: "#8E8E93",
    sloganColor: "#F6F6F8",
    chipBg: "#F6F6F8",
    chipBorder: "#E2E2E6",
    chipFg: "#3B3B40",
    slogan: "第一步，從這裡踏出。",
    restriction: "限制 · 無限制 · 暖身",
    reward: "獎勵 · 過關 → 基礎強化",
    isFinal: false,
  },
  hardship: {
    heroBg: "#3D6FB8",
    sloganColor: "#EEF3FB",
    chipBg: "#EEF3FB",
    chipBorder: "#C7D8EE",
    chipFg: "#1F3F6E",
    slogan: "鈍刃磨亮，需以時日。",
    restriction: "限制 · 期間 XP ×0.7",
    reward: "獎勵 · 過關 → 永久 +10% XP",
    isFinal: false,
  },
  rhythm: {
    heroBg: "#3F8C50",
    sloganColor: "#ECF6EE",
    chipBg: "#ECF6EE",
    chipBorder: "#C2DFC8",
    chipFg: "#1F4A2C",
    slogan: "順流者勝，逆潮者亡。",
    restriction: "限制 · 冷卻 ×1.33",
    reward: "獎勵 · 過關 → 中段 tier 上升",
    isFinal: false,
  },
  solitude: {
    heroBg: "#7A4FB5",
    sloganColor: "#F1ECF7",
    chipBg: "#F1ECF7",
    chipBorder: "#D6C9E8",
    chipFg: "#3F2470",
    slogan: "獨身入谷，只聞己聲。",
    restriction: "限制 · 群組加成失效",
    reward: "獎勵 · 過關 → 群組加成翻倍",
    isFinal: false,
  },
  awakening: {
    heroBg: "#B8772A",
    sloganColor: "#FBF1E8",
    chipBg: "#FBF1E8",
    chipBorder: "#EBCDA8",
    chipFg: "#7A4A12",
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
          size: "xxs",
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
    color: "#FFFFFF",
    weight: "bold",
    size: "md",
    wrap: true,
  });
  contents.push({
    type: "text",
    text: theme.slogan,
    color: theme.sloganColor,
    size: "xxs",
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
    backgroundColor: "#FFFFFF",
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
                size: "xxs",
                wrap: true,
              },
            ],
          },
          {
            type: "text",
            text: theme.reward,
            color: PRESTIGE_PURPLE,
            size: "xxs",
            wrap: true,
          },
        ],
      },
      { type: "separator", color: BODY_DIVIDER },
      {
        type: "text",
        text: `60 天為期 · 至 ${deadline}`,
        color: SUBTITLE_GRAY,
        size: "xxs",
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
