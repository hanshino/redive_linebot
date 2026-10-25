// LINE Flex carousel for the "you've hit Lv.100, time to prestige" broadcast.
// Visual system mirrors Lv50CTA + TrialEnter — purple/gold prestige theme.

const { PALETTE, SURFACE, TINT, PRESTIGE } = require("../../common/theme");
const {
  PRESTIGE_PURPLE,
  PRESTIGE_GOLD,
  PRESTIGE_LILAC,
  PRESTIGE_CAP,
  avatarBubble,
  levelBadge,
  bulletRow,
} = require("./_shared");

function buildHeroBubble({ displayName, pictureUrl, prestigeCount, passedTrialName, liffUri }) {
  const subtitle = passedTrialName
    ? `${passedTrialName} 試煉的成果即將收割`
    : "準備好邁向下一個階段了嗎？";

  const bodyContents = [
    {
      type: "text",
      text: "轉生後會發生什麼？",
      color: PRESTIGE_PURPLE,
      size: "md",
      weight: "bold",
    },
    {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        bulletRow("1", "等級歸零，但 7 選 1 的祝福永久保留"),
        bulletRow("2", "已通過試煉的成果（永久加成）保留下來"),
        bulletRow("3", `累計 ${PRESTIGE_CAP} 次轉生 → 覺醒終態（封頂）`),
      ],
    },
    progressChip(prestigeCount),
  ];

  if (prestigeCount === PRESTIGE_CAP - 1) {
    bodyContents.push(finalChip());
  } else if (prestigeCount === 0) {
    bodyContents.push(honeymoonChip());
  }

  return {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: PRESTIGE_PURPLE,
      paddingAll: "20px",
      paddingTop: "14px",
      paddingBottom: "16px",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "baseline",
          spacing: "xs",
          contents: [
            { type: "text", text: "🎉", size: "xs", flex: 0 },
            {
              type: "text",
              text: `恭喜 ${displayName}`,
              color: PRESTIGE_GOLD,
              size: "xs",
              weight: "bold",
            },
          ],
        },
        {
          type: "text",
          text: "⚡ 轉生時刻來臨",
          color: PRESTIGE_GOLD,
          size: "xl",
          weight: "bold",
          margin: "xs",
        },
        { type: "text", text: subtitle, color: PRESTIGE_LILAC, size: "xs" },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          margin: "md",
          alignItems: "center",
          contents: [
            avatarBubble(pictureUrl),
            {
              type: "text",
              text: displayName,
              color: PALETTE.white,
              size: "sm",
              weight: "bold",
              flex: 0,
              gravity: "center",
            },
            levelBadge(),
          ],
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "20px",
      contents: bodyContents,
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      paddingTop: "8px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: PRESTIGE_GOLD,
          height: "sm",
          action: { type: "uri", label: "前往選擇祝福", uri: liffUri },
        },
      ],
    },
    styles: { footer: { backgroundColor: PALETTE.white } },
  };
}

function progressChip(prestigeCount) {
  return {
    type: "box",
    layout: "horizontal",
    backgroundColor: TINT.purple.bg,
    cornerRadius: "999px",
    paddingAll: "8px",
    borderWidth: "1px",
    borderColor: TINT.purple.border,
    margin: "sm",
    contents: [
      {
        type: "text",
        text: `轉生進度  ${prestigeCount} / ${PRESTIGE_CAP}`,
        color: PRESTIGE_PURPLE,
        size: "xs",
        weight: "bold",
        align: "center",
      },
    ],
  };
}

function honeymoonChip() {
  return {
    type: "box",
    layout: "horizontal",
    backgroundColor: PRESTIGE.successBg,
    cornerRadius: "999px",
    paddingAll: "8px",
    borderWidth: "1px",
    borderColor: PRESTIGE.successBorder,
    contents: [
      {
        type: "text",
        text: "🌱 蜜月加成將在首次轉生後消失",
        color: PRESTIGE.successInk,
        size: "xs",
        weight: "bold",
        align: "center",
        wrap: true,
      },
    ],
  };
}

function finalChip() {
  return {
    type: "box",
    layout: "horizontal",
    backgroundColor: TINT.amber.bg,
    cornerRadius: "999px",
    paddingAll: "8px",
    borderWidth: "1px",
    borderColor: PRESTIGE_GOLD,
    contents: [
      {
        type: "text",
        text: "✨ 此為最終轉生 — 完成後達成覺醒",
        color: TINT.amber.ink,
        size: "xs",
        weight: "bold",
        align: "center",
        wrap: true,
      },
    ],
  };
}

const BLESSINGS = [
  {
    name: "語言天賦",
    desc: "每則訊息 +8% XP",
    color: TINT.blue.main,
    bg: TINT.blue.bg,
    border: TINT.blue.border,
    descColor: TINT.blue.desc,
  },
  {
    name: "迅雷語速",
    desc: "冷卻速度提升",
    color: TINT.green.main,
    bg: TINT.green.bg,
    border: TINT.green.border,
    descColor: TINT.green.desc,
  },
  {
    name: "燃燒餘熱",
    desc: "中段 tier ↑",
    color: TINT.amber.main,
    bg: TINT.amber.bg,
    border: TINT.amber.border,
    descColor: TINT.amber.desc,
  },
  {
    name: "絮語之心",
    desc: "群組門檻降低",
    color: TINT.purple.main,
    bg: TINT.purple.bg,
    border: TINT.purple.border,
    descColor: TINT.purple.desc,
  },
  {
    name: "節律之泉",
    desc: "連續發話加成",
    color: TINT.periwinkle.main,
    bg: TINT.periwinkle.bg,
    border: TINT.periwinkle.border,
    descColor: TINT.blue.desc,
  },
  {
    name: "群星加護",
    desc: "群組加成 slope ↑",
    color: TINT.ochre.main,
    bg: TINT.ochre.bg,
    border: TINT.ochre.border,
    descColor: TINT.amber.desc,
  },
  {
    name: "溫室之語",
    desc: "小群組 +30%",
    color: TINT.green.main,
    bg: TINT.green.bg,
    border: TINT.green.border,
    descColor: TINT.green.desc,
  },
];

function blessingChip(b) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: b.bg,
    cornerRadius: "8px",
    paddingAll: "10px",
    borderWidth: "1px",
    borderColor: b.border,
    contents: [
      {
        type: "box",
        layout: "baseline",
        spacing: "sm",
        contents: [
          { type: "text", text: "✦", color: b.color, size: "sm", weight: "bold", flex: 0 },
          { type: "text", text: b.name, color: SURFACE.text, size: "sm", weight: "bold", flex: 0 },
          { type: "text", text: b.desc, color: b.descColor, size: "xs" },
        ],
      },
    ],
  };
}

function buildBlessingsBubble({ prestigeCount }) {
  const remaining = Math.max(PRESTIGE_CAP - 1 - prestigeCount, 0);
  const footnote =
    remaining > 0
      ? `自由挑選 · 永久效果 · 後續轉生陸續解鎖剩餘 ${remaining} 個`
      : "自由挑選 · 永久效果 · 此為最後一個祝福";

  return {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: PRESTIGE_PURPLE,
      paddingAll: "20px",
      paddingTop: "18px",
      paddingBottom: "16px",
      spacing: "xs",
      contents: [
        {
          type: "text",
          text: "✨ 七大祝福",
          color: PRESTIGE_GOLD,
          size: "xl",
          weight: "bold",
        },
        {
          type: "text",
          text: "擇一永久強化你的轉生之路",
          color: PRESTIGE_LILAC,
          size: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "20px",
      contents: [
        ...BLESSINGS.map(blessingChip),
        {
          type: "text",
          text: footnote,
          color: SURFACE.textMuted,
          size: "xs",
          wrap: true,
          margin: "md",
        },
      ],
    },
  };
}

/**
 * Build the Lv.100 prestige CTA flex carousel.
 *
 * @param {Object} input
 * @param {String} input.displayName
 * @param {String} [input.pictureUrl]
 * @param {Number} input.prestigeCount    0..PRESTIGE_CAP-1
 * @param {String} [input.passedTrialName] display_name of the unconsumed passed trial (optional)
 * @param {String} input.liffUri
 * @returns {{ altText: String, contents: Object }}
 */
exports.build = ({ displayName, pictureUrl, prestigeCount, passedTrialName, liffUri }) => {
  const safeName = displayName || "玩家";
  const safeCount = Number.isInteger(prestigeCount) ? prestigeCount : 0;
  return {
    altText: `${safeName} 已達 Lv.100，可前往 LIFF 完成轉生`,
    contents: {
      type: "carousel",
      contents: [
        buildHeroBubble({
          displayName: safeName,
          pictureUrl,
          prestigeCount: safeCount,
          passedTrialName,
          liffUri,
        }),
        buildBlessingsBubble({ prestigeCount: safeCount }),
      ],
    },
  };
};
