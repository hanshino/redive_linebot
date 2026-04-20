const { SEMANTIC } = require("../../common/theme");

const CYAN_700 = "#00838F";
const CYAN_600 = SEMANTIC.primary.main;
const CYAN_400 = "#4DD0E1";
const CYAN_BG = "#E0F7FA";
const AMBER_500 = SEMANTIC.secondary.main;
const AMBER_400 = SEMANTIC.secondary.light;
const AMBER_BG = "#FFF7E6";
const GREEN_500 = SEMANTIC.success.main;
const GREEN_BG = "#E8F9EF";
const RED_500 = SEMANTIC.danger.main;
const RED_BG = "#FDECEC";
const TEXT = "#1A2332";
const MUTED = "#5A6B7F";
const TRACK = "#F0F4F7";
const DIVIDER = "#EEF2F6";

function accentBar() {
  return {
    type: "box",
    layout: "vertical",
    contents: [],
    height: "4px",
    background: {
      type: "linearGradient",
      angle: "90deg",
      startColor: CYAN_700,
      endColor: CYAN_400,
    },
    backgroundColor: CYAN_700,
  };
}

function header() {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: "布丁世界進度",
        weight: "bold",
        size: "sm",
        color: TEXT,
        flex: 1,
      },
      {
        type: "text",
        text: "蒐集 · 戰績",
        size: "xxs",
        color: MUTED,
        align: "end",
        gravity: "bottom",
        flex: 0,
      },
    ],
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    paddingBottom: "sm",
    alignItems: "center",
  };
}

function progressBlock({ label, valueText, percent, fillColorStart, fillColorEnd, metaText }) {
  const clamped = Math.max(0, Math.min(100, percent || 0));

  const head = {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "xs", color: MUTED, weight: "bold", flex: 1 },
      {
        type: "text",
        text: valueText,
        size: "xs",
        color: TEXT,
        weight: "bold",
        align: "end",
        flex: 0,
      },
    ],
  };

  const bar = {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [],
        height: "6px",
        width: `${clamped}%`,
        cornerRadius: "md",
        background: {
          type: "linearGradient",
          angle: "90deg",
          startColor: fillColorStart,
          endColor: fillColorEnd,
        },
        backgroundColor: fillColorStart,
      },
    ],
    backgroundColor: TRACK,
    height: "6px",
    cornerRadius: "md",
    margin: "sm",
  };

  const contents = [head, bar];
  if (metaText) {
    contents.push({
      type: "text",
      text: metaText,
      size: "xxs",
      color: MUTED,
      align: "end",
      margin: "xs",
    });
  }

  return {
    type: "box",
    layout: "vertical",
    contents,
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    paddingBottom: "md",
    borderWidth: "1px",
    borderColor: DIVIDER,
    cornerRadius: "none",
  };
}

function divider() {
  return {
    type: "separator",
    color: DIVIDER,
  };
}

function walletRow({ godStone, paidStone }) {
  const format = n => Number(n || 0).toLocaleString("en-US");
  const coin = ({ label, value }) => ({
    type: "box",
    layout: "vertical",
    contents: [
      { type: "text", text: label, size: "xxs", color: MUTED },
      {
        type: "text",
        text: format(value),
        size: "md",
        color: AMBER_500,
        weight: "bold",
        margin: "xs",
      },
    ],
    backgroundColor: AMBER_BG,
    cornerRadius: "md",
    paddingAll: "sm",
    flex: 1,
  });

  return {
    type: "box",
    layout: "horizontal",
    contents: [
      coin({ label: "💎 女神石", value: godStone }),
      coin({ label: "💰 付費贊助", value: paidStone }),
    ],
    spacing: "sm",
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    paddingBottom: "md",
  };
}

function jankenBlock({ win, lose, draw, rate }) {
  const cell = ({ value, label, fg, bg }) => ({
    type: "box",
    layout: "vertical",
    contents: [
      { type: "text", text: String(value), size: "md", color: fg, weight: "bold", align: "center" },
      { type: "text", text: label, size: "xxs", color: MUTED, align: "center" },
    ],
    backgroundColor: bg,
    cornerRadius: "md",
    paddingTop: "xs",
    paddingBottom: "xs",
    flex: 1,
  });

  const rateDisplay = typeof rate === "number" && Number.isFinite(rate) ? `${rate}%` : "-";

  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "猜拳戰績", size: "xs", color: MUTED, weight: "bold", flex: 1 },
          {
            type: "text",
            contents: [
              { type: "span", text: "勝率 ", size: "xs", color: MUTED },
              { type: "span", text: rateDisplay, size: "xs", color: CYAN_700, weight: "bold" },
            ],
            align: "end",
            flex: 0,
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          cell({ value: win || 0, label: "勝", fg: GREEN_500, bg: GREEN_BG }),
          cell({ value: lose || 0, label: "敗", fg: RED_500, bg: RED_BG }),
          cell({ value: draw || 0, label: "平", fg: CYAN_700, bg: CYAN_BG }),
        ],
        spacing: "sm",
        margin: "sm",
      },
    ],
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    paddingBottom: "lg",
  };
}

function formatLastDay(days) {
  if (days === null || days === undefined || days === "-") return "-";
  return `${days} 天前`;
}

exports.build = ({
  characterCurrent,
  characterTotal,
  starProgress,
  godStone,
  paidStone,
  lastRainbowDays,
  lastHasNewDays,
  janken,
}) => {
  const characterPercent =
    characterTotal > 0 ? Math.round(((characterCurrent || 0) / characterTotal) * 100) : 0;

  const contents = [
    accentBar(),
    header(),
    divider(),
    progressBlock({
      label: "蒐集角色",
      valueText: `${characterCurrent || 0} / ${characterTotal || 0}`,
      percent: characterPercent,
      fillColorStart: CYAN_600,
      fillColorEnd: CYAN_400,
      metaText: `🌈 ${formatLastDay(lastRainbowDays)}上次出彩`,
    }),
    divider(),
    progressBlock({
      label: "累積星數",
      valueText: `${starProgress || 0}%`,
      percent: starProgress || 0,
      fillColorStart: AMBER_500,
      fillColorEnd: AMBER_400,
      metaText: `✨ ${formatLastDay(lastHasNewDays)}上次出新`,
    }),
    divider(),
    walletRow({ godStone, paidStone }),
    divider(),
    jankenBlock(janken),
  ];

  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      contents,
      spacing: "none",
      paddingAll: "none",
    },
  };
};
