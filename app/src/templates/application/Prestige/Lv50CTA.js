const PRESTIGE_PURPLE = "#3B2A6B";
const PRESTIGE_GOLD = "#F5C84B";
const PRESTIGE_PURPLE_DEEP = "#2A1F4D";
const PRESTIGE_LILAC = "#E5DFFF";
const FALLBACK_AVATAR = "https://i.imgur.com/NMl4z2u.png";

function buildHeroBubble({ displayName, pictureUrl, level, liffUri }) {
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
              text: `恭喜 ${displayName} 達成 Lv.${level}`,
              color: PRESTIGE_GOLD,
              size: "xs",
              weight: "bold",
            },
          ],
        },
        {
          type: "text",
          text: "✨ 轉生系統解放",
          color: PRESTIGE_GOLD,
          size: "xl",
          weight: "bold",
          margin: "xs",
        },
        {
          type: "text",
          text: `${displayName}，你的試煉之路已開啟`,
          color: PRESTIGE_LILAC,
          size: "xs",
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          margin: "md",
          alignItems: "center",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: "36px",
              height: "36px",
              cornerRadius: "18px",
              backgroundColor: PRESTIGE_PURPLE_DEEP,
              borderColor: PRESTIGE_GOLD,
              borderWidth: "1.5px",
              flex: 0,
              contents: [
                {
                  type: "image",
                  url: pictureUrl || FALLBACK_AVATAR,
                  size: "full",
                  aspectMode: "cover",
                  aspectRatio: "1:1",
                },
              ],
            },
            {
              type: "text",
              text: displayName,
              color: "#FFFFFF",
              size: "sm",
              weight: "bold",
              flex: 0,
              gravity: "center",
            },
            {
              type: "box",
              layout: "vertical",
              backgroundColor: PRESTIGE_PURPLE_DEEP,
              cornerRadius: "10px",
              paddingTop: "3px",
              paddingBottom: "3px",
              paddingStart: "10px",
              paddingEnd: "10px",
              borderColor: PRESTIGE_GOLD,
              borderWidth: "1px",
              flex: 0,
              contents: [
                {
                  type: "text",
                  text: `Lv.${level}`,
                  color: PRESTIGE_GOLD,
                  size: "xs",
                  weight: "bold",
                  align: "center",
                },
              ],
            },
          ],
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: "什麼是轉生？",
          color: PRESTIGE_PURPLE,
          size: "md",
          weight: "bold",
        },
        {
          type: "text",
          text: "Lv.100 達標後可挑戰試煉並選擇祝福，完成後等級歸零、獲得永久強化。",
          color: "#444444",
          size: "sm",
          wrap: true,
        },
        {
          type: "text",
          text: "累計 5 次轉生 → ✨ 覺醒者（最終態，封頂）。",
          color: "#444444",
          size: "sm",
          wrap: true,
        },
        {
          type: "separator",
          color: "#EEEAF7",
          margin: "md",
        },
        {
          type: "text",
          text: "下一張 → 五項試煉介紹",
          color: "#8E8E93",
          size: "xxs",
          align: "center",
          margin: "sm",
        },
      ],
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
          action: {
            type: "uri",
            label: "前往挑戰試煉",
            uri: liffUri,
          },
        },
      ],
    },
    styles: {
      footer: {
        backgroundColor: "#FFFFFF",
      },
    },
  };
}

function trialChip({ star, name, desc, fg, starColor, descColor, bg, borderColor }) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: bg,
    cornerRadius: "8px",
    paddingAll: "10px",
    borderWidth: "1px",
    borderColor,
    contents: [
      {
        type: "box",
        layout: "baseline",
        spacing: "sm",
        contents: [
          { type: "text", text: `★${star}`, color: starColor, size: "sm", weight: "bold", flex: 0 },
          { type: "text", text: name, color: fg, size: "sm", weight: "bold", flex: 0 },
          { type: "text", text: desc, color: descColor, size: "xs" },
        ],
      },
    ],
  };
}

function buildTrialsBubble({ showHoneymoon }) {
  const chips = [
    trialChip({
      star: 1,
      name: "啟程",
      desc: "暖身，無限制",
      fg: "#1C1C1E",
      starColor: "#8E8E93",
      descColor: "#6B6B70",
      bg: "#F6F6F8",
      borderColor: "#E2E2E6",
    }),
    trialChip({
      star: 2,
      name: "刻苦",
      desc: "XP ×0.7，永久 +10%",
      fg: "#1C1C1E",
      starColor: "#3D6FB8",
      descColor: "#5E6470",
      bg: "#EEF3FB",
      borderColor: "#C7D8EE",
    }),
    trialChip({
      star: 3,
      name: "律動",
      desc: "冷卻 ×1.33，中段 tier ↑",
      fg: "#1C1C1E",
      starColor: "#3F8C50",
      descColor: "#5C6E60",
      bg: "#ECF6EE",
      borderColor: "#C2DFC8",
    }),
    trialChip({
      star: 4,
      name: "孤鳴",
      desc: "群組加成失效，通過後翻倍",
      fg: "#1C1C1E",
      starColor: "#7A4FB5",
      descColor: "#665A78",
      bg: "#F1ECF7",
      borderColor: "#D6C9E8",
    }),
    trialChip({
      star: 5,
      name: "覺悟",
      desc: "XP ×0.5，+15% + 覺醒",
      fg: "#1C1C1E",
      starColor: "#B8772A",
      descColor: "#74604A",
      bg: "#FBF1E8",
      borderColor: "#EBCDA8",
    }),
  ];

  const bodyContents = [
    ...chips,
    {
      type: "text",
      text: "自由選順序 · 60 天為期 · 期間 XP 同時計入等級與試煉進度",
      color: "#8E8E93",
      size: "xxs",
      wrap: true,
      margin: "md",
    },
  ];

  if (showHoneymoon) {
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      backgroundColor: "#E8F6EC",
      cornerRadius: "999px",
      paddingAll: "8px",
      borderWidth: "1px",
      borderColor: "#B8DEC2",
      margin: "md",
      contents: [
        {
          type: "text",
          text: "🌱 蜜月加成中 · XP +20%",
          color: "#2F6B3F",
          size: "xs",
          weight: "bold",
          align: "center",
        },
      ],
    });
  }

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
          text: "⚔ 五項試煉",
          color: PRESTIGE_GOLD,
          size: "xl",
          weight: "bold",
        },
        {
          type: "text",
          text: "通過試煉 · 解鎖永久強化",
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
      contents: bodyContents,
    },
  };
}

/**
 * Build the Lv.50 CTA flex carousel for a freshly-promoted player.
 *
 * @param {Object} input
 * @param {String} input.displayName
 * @param {String} [input.pictureUrl]  LINE profile picture; falls back to a default
 * @param {Number} input.level         current level (display only, normally 50)
 * @param {Number} input.prestigeCount drives the honeymoon chip
 * @param {String} input.liffUri       prestige page LIFF URL
 * @returns {{ altText: String, contents: Object }}
 */
exports.build = ({ displayName, pictureUrl, level, prestigeCount, liffUri }) => {
  const safeName = displayName || "玩家";
  return {
    altText: `${safeName} 已達成 Lv.${level}，可前往 LIFF 開始挑戰試煉`,
    contents: {
      type: "carousel",
      contents: [
        buildHeroBubble({ displayName: safeName, pictureUrl, level, liffUri }),
        buildTrialsBubble({ showHoneymoon: prestigeCount === 0 }),
      ],
    },
  };
};
