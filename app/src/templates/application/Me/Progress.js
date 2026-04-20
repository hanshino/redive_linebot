const { COLORS, buildAccentBar } = require("./_shared");

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
        color: COLORS.text,
        flex: 1,
      },
      {
        type: "text",
        text: "蒐集 · 戰績",
        size: "xxs",
        color: COLORS.textMuted,
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
      { type: "text", text: label, size: "xs", color: COLORS.textMuted, weight: "bold", flex: 1 },
      {
        type: "text",
        text: valueText,
        size: "xs",
        color: COLORS.text,
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
    backgroundColor: COLORS.track,
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
      color: COLORS.textMuted,
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
    borderColor: COLORS.divider,
    cornerRadius: "none",
  };
}

function divider() {
  return {
    type: "separator",
    color: COLORS.divider,
  };
}

function walletRow({ godStone, paidStone }) {
  const format = n => Number(n || 0).toLocaleString("en-US");
  const coin = ({ label, value }) => ({
    type: "box",
    layout: "vertical",
    contents: [
      { type: "text", text: label, size: "xxs", color: COLORS.textMuted },
      {
        type: "text",
        text: format(value),
        size: "md",
        color: COLORS.amber500,
        weight: "bold",
        margin: "xs",
      },
    ],
    backgroundColor: COLORS.amberBg,
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
      { type: "text", text: label, size: "xxs", color: COLORS.textMuted, align: "center" },
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
          {
            type: "text",
            text: "猜拳戰績",
            size: "xs",
            color: COLORS.textMuted,
            weight: "bold",
            flex: 1,
          },
          {
            type: "text",
            contents: [
              { type: "span", text: "勝率 ", size: "xs", color: COLORS.textMuted },
              {
                type: "span",
                text: rateDisplay,
                size: "xs",
                color: COLORS.cyan700,
                weight: "bold",
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
        contents: [
          cell({ value: win || 0, label: "勝", fg: COLORS.green500, bg: COLORS.greenBg }),
          cell({ value: lose || 0, label: "敗", fg: COLORS.red500, bg: COLORS.redBg }),
          cell({ value: draw || 0, label: "平", fg: COLORS.cyan700, bg: COLORS.cyanBg }),
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
  if (days === null || days === undefined) return "-";
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
    buildAccentBar({ startColor: COLORS.cyan700, endColor: COLORS.cyan400 }),
    header(),
    divider(),
    progressBlock({
      label: "蒐集角色",
      valueText: `${characterCurrent || 0} / ${characterTotal || 0}`,
      percent: characterPercent,
      fillColorStart: COLORS.cyan600,
      fillColorEnd: COLORS.cyan400,
      metaText: `🌈 ${formatLastDay(lastRainbowDays)}上次出彩`,
    }),
    divider(),
    progressBlock({
      label: "累積星數",
      valueText: `${starProgress || 0}%`,
      percent: starProgress || 0,
      fillColorStart: COLORS.amber500,
      fillColorEnd: COLORS.amber400,
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
