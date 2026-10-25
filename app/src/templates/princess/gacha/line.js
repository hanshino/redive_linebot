const { PALETTE, SEMANTIC, RARITY, SURFACE, OVERLAY } = require("../../common/theme");
/**
 * 產出轉蛋頭像框
 * @param {Array} rewards
 */
function genGachaContent(rewards) {
  let bubbleMessage = {
    type: "bubble",
    body: { type: "box", layout: "vertical", spacing: "sm", contents: [] },
  };

  let box = {
    type: "box",
    layout: "horizontal",
    contents: [],
    spacing: "sm",
  };

  let temp = [];

  rewards.forEach((reward, index, selfAry) => {
    temp.push({
      type: "image",
      url: reward.imageUrl,
      size: "xs",
    });

    if (temp.length === 5 || index === selfAry.length - 1) {
      bubbleMessage.body.contents.push({
        ...box,
        contents: temp,
      });
      temp = [];
    }
  });

  return bubbleMessage;
}

/**
 * 產生每日一抽報表
 * @param {Object}  DailyGachaInfo
 * @param {Array}   DailyGachaInfo.newCharacters
 * @param {Number}  DailyGachaInfo.collectedCount
 * @param {Number}  DailyGachaInfo.allCount
 * @param {Number}  DailyGachaInfo.gainGodStoneAmount
 * @param {Number}  DailyGachaInfo.ownGodStone  擁有女神石
 * @param {Number}  DailyGachaInfo.costGodStone 消耗女神石
 */
function genDailyGacha({
  newCharacters,
  collectedCount,
  allCount,
  gainGodStoneAmount,
  ownGodStone,
  costGodStone,
}) {
  let collectRate = Math.round((collectedCount / allCount) * 10000) / 100;
  let bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "image",
          url: "https://i.imgur.com/GCjkKhZ.jpg",
          size: "full",
          gravity: "top",
          aspectMode: "cover",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "每日一抽",
                  size: "xl",
                  color: PALETTE.white,
                  weight: "bold",
                },
              ],
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  color: OVERLAY.onColor,
                  size: "sm",
                  contents: [
                    {
                      type: "span",
                      text: "新角色：",
                    },
                  ],
                  wrap: true,
                },
                {
                  type: "text",
                  color: OVERLAY.onColor,
                  size: "sm",
                  contents: [
                    {
                      type: "span",
                      text: `獲得女神石：${ownGodStone} + ${gainGodStoneAmount} ${
                        costGodStone ? `- ${costGodStone}` : ""
                      }`,
                    },
                  ],
                },
              ],
              spacing: "lg",
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      text: "距離滿收藏",
                      color: OVERLAY.onColor,
                      size: "xs",
                    },
                    {
                      type: "text",
                      text: `${collectedCount}/${allCount}`,
                      color: OVERLAY.onColor,
                      size: "xs",
                      align: "end",
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "box",
                      layout: "vertical",
                      contents: [],
                      height: "6px",
                      width: `${collectRate}%`,
                      backgroundColor: SEMANTIC.secondary.light,
                    },
                  ],
                  backgroundColor: OVERLAY.onColorSoft,
                  height: "6px",
                },
              ],
              margin: "xs",
            },
          ],
          position: "absolute",
          offsetBottom: "0px",
          offsetStart: "0px",
          offsetEnd: "0px",
          backgroundColor: OVERLAY.scrimCyan,
          paddingAll: "20px",
          paddingTop: "18px",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "NEW",
              color: PALETTE.white,
              align: "center",
              size: "xs",
              offsetTop: "3px",
            },
          ],
          position: "absolute",
          cornerRadius: "20px",
          offsetTop: "18px",
          backgroundColor: SEMANTIC.danger.main,
          offsetStart: "12px",
          height: "25px",
          width: "70px",
        },
      ],
      paddingAll: "0px",
    },
  };

  newCharacters.forEach(character => {
    bubble.body.contents[1].contents[1].contents[0].contents.push({
      type: "span",
      text: `${character.name} `,
    });
  });

  return bubble;
}

// 稀有度上色：彩 / 金 / 銀 各取 theme.js 的 RARITY，文字同時保留名稱，不單靠顏色辨識
const RARE_STYLE = {
  3: { name: "彩", color: RARITY.epic.main },
  2: { name: "金", color: RARITY.legendary.text },
  1: { name: "銀", color: RARITY.common.text },
};

/**
 * 轉蛋結果摘要文字（給 altText 用），例如「彩×1 金×2 銀×7」
 * @param {Object} rareCount 星數 → 數量
 * @returns {String}
 */
function formatRareSummary(rareCount) {
  return Object.keys(rareCount || {})
    .sort((a, b) => b - a)
    .filter(key => RARE_STYLE[key])
    .map(key => `${RARE_STYLE[key].name}×${rareCount[key]}`)
    .join(" ");
}

function generateGachaResult({ rewards, tag, rareCount, hasCooldown }) {
  let bubbleMessage = genGachaContent(rewards);

  let reportBox = {
    type: "box",
    layout: "vertical",
    contents: [],
    spacing: "md",
  };

  reportBox.contents.push({
    type: "text",
    contents: [
      { type: "span", text: "許願內容：" },
      { type: "span", text: tag || "-" },
    ],
    weight: "bold",
    align: "center",
  });

  const reportSpans = [];
  Object.keys(rareCount)
    .sort((a, b) => b - a)
    .forEach(key => {
      const style = RARE_STYLE[key];
      if (!style) return;
      if (reportSpans.length > 0) reportSpans.push({ type: "span", text: " " });
      reportSpans.push({
        type: "span",
        text: `${style.name}×${rareCount[key]}`,
        color: style.color,
        weight: "bold",
      });
    });

  reportBox.contents.push({
    type: "text",
    contents: reportSpans.length > 0 ? reportSpans : [{ type: "span", text: "-" }],
    align: "center",
  });

  if (hasCooldown) {
    reportBox.contents.push({
      type: "text",
      text: "群組聊天室，每位成員限定120秒CD",
      size: "xs",
      color: SURFACE.textMuted,
      align: "center",
    });
  }

  bubbleMessage.footer = reportBox;

  return bubbleMessage;
}

exports.generateGachaResult = generateGachaResult;
exports.formatRareSummary = formatRareSummary;
exports.generateDailyGachaInfo = genDailyGacha;
