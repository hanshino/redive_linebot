const humanNumber = require("human-number");
const { SEMANTIC } = require("../../common/theme");
const { buildSubPanel } = require("./_shared");

const CYAN_700 = "#00838F";
const CYAN_600 = SEMANTIC.primary.main;
const CYAN_BG = "#E0F7FA";
const AMBER_400 = SEMANTIC.secondary.light;
const AMBER_300 = "#FCD34D";
const AMBER_BG = "#FFF7E6";
const GREEN_500 = SEMANTIC.success.main;
const GREEN_BG = "#E8F9EF";
const RED_500 = SEMANTIC.danger.main;
const RED_BG = "#FDECEC";
const TEXT_DARK = "#3A2800";
const MUTED = "#5A6B7F";

const formatExp = n => humanNumber(n, v => Number.parseFloat(v).toFixed(1));

function buildHero({
  displayName,
  pictureUrl,
  level,
  range,
  ranking,
  expRate,
  expCurrent,
  expNext,
}) {
  const avatar = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "image",
        url: pictureUrl,
        aspectMode: "cover",
        aspectRatio: "1:1",
        size: "full",
      },
    ],
    cornerRadius: "100px",
    width: "60px",
    height: "60px",
    borderWidth: "2px",
    borderColor: "#FFFFFF",
    flex: 0,
  };

  const levelPill = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: `Lv.${level} · ${range}`,
        weight: "bold",
        size: "xxs",
        color: TEXT_DARK,
        align: "center",
      },
    ],
    backgroundColor: AMBER_400,
    cornerRadius: "xl",
    paddingStart: "sm",
    paddingEnd: "sm",
    paddingTop: "2px",
    paddingBottom: "2px",
    flex: 0,
  };

  const nameRow = {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: displayName,
        weight: "bold",
        size: "md",
        color: "#FFFFFF",
        flex: 1,
        gravity: "center",
      },
      levelPill,
    ],
    spacing: "sm",
    alignItems: "center",
  };

  const rankRow = {
    type: "text",
    text: `Rank #${ranking}`,
    size: "xxs",
    color: AMBER_300,
    weight: "bold",
    margin: "xs",
  };

  const ident = {
    type: "box",
    layout: "vertical",
    contents: [nameRow, rankRow],
    flex: 1,
  };

  const topRow = {
    type: "box",
    layout: "horizontal",
    contents: [avatar, ident],
    spacing: "md",
    alignItems: "center",
  };

  const isMax = !expNext && level > 0;
  const expText = isMax ? "MAX" : `${formatExp(expCurrent)} / ${formatExp(expNext)}`;
  const clampedRate = isMax ? 100 : Math.max(0, Math.min(100, expRate || 0));

  const expHead = {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: "EXP", size: "xxs", color: "#FFFFFF", flex: 0 },
      {
        type: "text",
        text: expText,
        size: "xxs",
        color: AMBER_300,
        weight: "bold",
        align: "end",
      },
    ],
    margin: "md",
  };

  const expBar = {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [],
        height: "7px",
        backgroundColor: AMBER_400,
        width: `${clampedRate}%`,
        cornerRadius: "md",
      },
    ],
    backgroundColor: "#FFFFFF44",
    height: "7px",
    cornerRadius: "md",
    margin: "xs",
  };

  return {
    type: "box",
    layout: "vertical",
    contents: [topRow, expHead, expBar],
    paddingAll: "lg",
    background: {
      type: "linearGradient",
      angle: "135deg",
      startColor: CYAN_700,
      endColor: CYAN_600,
    },
    backgroundColor: CYAN_700,
  };
}

function buildSubBadge({ text }) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: `🎟 訂閱中 · ${text}`,
        size: "xxs",
        color: CYAN_700,
        weight: "bold",
        flex: 1,
        gravity: "center",
      },
      {
        type: "text",
        text: "›",
        size: "md",
        color: CYAN_700,
        weight: "bold",
        align: "end",
        flex: 0,
      },
    ],
    backgroundColor: CYAN_BG,
    paddingStart: "md",
    paddingEnd: "md",
    paddingTop: "sm",
    paddingBottom: "sm",
    margin: "none",
  };
}

function buildStat({ fraction, icon, label, tone }) {
  const toneMap = {
    done: { bg: GREEN_BG, fg: GREEN_500, accent: GREEN_500 },
    miss: { bg: RED_BG, fg: RED_500, accent: RED_500 },
    progress: { bg: CYAN_BG, fg: CYAN_700, accent: CYAN_600 },
  };
  const { bg, fg, accent } = toneMap[tone] || toneMap.progress;

  const leftBar = {
    type: "box",
    layout: "vertical",
    contents: [],
    width: "3px",
    backgroundColor: accent,
  };

  const content = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: icon, size: "sm", color: fg, weight: "bold", flex: 0 },
          { type: "text", text: " ", size: "xxs", flex: 0 },
          { type: "text", text: fraction, size: "sm", color: fg, weight: "bold", flex: 0 },
        ],
      },
      {
        type: "text",
        text: label,
        size: "xxs",
        color: MUTED,
        align: "center",
        margin: "xs",
      },
    ],
    backgroundColor: bg,
    paddingAll: "sm",
    flex: 1,
    alignItems: "center",
  };

  return {
    type: "box",
    layout: "horizontal",
    contents: [leftBar, content],
    cornerRadius: "md",
    flex: 1,
  };
}

function buildStatsRow({ gacha, janken, weeklyCompleted }) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      buildStat({
        fraction: `${gacha ? 1 : 0}/1`,
        icon: gacha ? "✓" : "!",
        label: "今日轉蛋",
        tone: gacha ? "done" : "miss",
      }),
      buildStat({
        fraction: `${janken ? 1 : 0}/1`,
        icon: janken ? "✓" : "!",
        label: "今日猜拳",
        tone: janken ? "done" : "miss",
      }),
      buildStat({
        fraction: `${Math.min(weeklyCompleted || 0, 7)}/7`,
        icon: "⋯",
        label: "週任務",
        tone: "progress",
      }),
    ],
    spacing: "sm",
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
  };
}

function buildStreak(signinDays) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: "🔥 連續簽到",
        size: "xs",
        color: MUTED,
        flex: 1,
        gravity: "center",
      },
      {
        type: "text",
        contents: [
          {
            type: "span",
            text: `${signinDays || 0}`,
            weight: "bold",
            color: SEMANTIC.warning.main,
            size: "md",
          },
          { type: "span", text: " 天", color: MUTED, size: "xs" },
        ],
        align: "end",
        flex: 0,
      },
    ],
    backgroundColor: AMBER_BG,
    cornerRadius: "md",
    paddingStart: "md",
    paddingEnd: "md",
    paddingTop: "sm",
    paddingBottom: "sm",
    margin: "md",
    alignItems: "center",
  };
}

exports.build = ({
  displayName,
  pictureUrl,
  level,
  range,
  ranking,
  expRate,
  expCurrent,
  expNext,
  today,
  signinDays,
  subscriptionPanel,
  subscriptionBadge,
}) => {
  const bodyContents = [
    buildHero({ displayName, pictureUrl, level, range, ranking, expRate, expCurrent, expNext }),
  ];

  if (subscriptionPanel) {
    bodyContents.push(buildSubPanel(subscriptionPanel));
  } else if (subscriptionBadge) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      contents: [buildSubBadge(subscriptionBadge)],
      paddingStart: "lg",
      paddingEnd: "lg",
      paddingTop: "md",
    });
  }

  bodyContents.push(buildStatsRow(today));
  bodyContents.push({
    type: "box",
    layout: "vertical",
    contents: [buildStreak(signinDays)],
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingBottom: "lg",
  });

  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      contents: bodyContents,
      spacing: "none",
      paddingAll: "none",
    },
  };
};
