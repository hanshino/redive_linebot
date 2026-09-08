const { get } = require("lodash");

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
 * @param {Array}   DailyGachaInfo.fragmentRewards 重複角色換得的碎片 [{itemId, name, amount}]
 * @param {Number}  DailyGachaInfo.costGodStone 消耗女神石
 */
function genDailyGacha({
  newCharacters,
  collectedCount,
  allCount,
  fragmentRewards = [],
  costGodStone,
}) {
  let collectRate = Math.round((collectedCount / allCount) * 10000) / 100;

  const newCharacterText = {
    type: "text",
    color: "#ebebeb",
    size: "sm",
    contents: [
      {
        type: "span",
        text: "新角色：",
      },
    ],
    wrap: true,
  };

  newCharacters.forEach(character => {
    newCharacterText.contents.push({
      type: "span",
      text: `${character.name} `,
    });
  });

  // ponytail: 十抽最多 10 種角色，overlay 是絕對定位在卡圖上的，全列出會把圖蓋掉。
  // 顯示前 5 種（已按 amount 由多至少排序），其餘只報種類數。
  const shown = fragmentRewards.slice(0, 5);
  const restCount = fragmentRewards.length - shown.length;
  const fragmentText = {
    type: "text",
    color: "#ebebeb",
    size: "sm",
    wrap: true,
    contents: [{ type: "span", text: "碎片：" }],
  };

  if (fragmentRewards.length === 0) {
    fragmentText.contents.push({ type: "span", text: "無" });
  } else {
    shown.forEach(fragment => {
      fragmentText.contents.push({
        type: "span",
        text: `${fragment.name} ×${fragment.amount} `,
      });
    });
    if (restCount > 0) {
      fragmentText.contents.push({ type: "span", text: `等 ${fragmentRewards.length} 種角色` });
    }
  }

  const infoContents = [newCharacterText, fragmentText];

  if (costGodStone) {
    infoContents.push({
      type: "text",
      color: "#ebebeb",
      size: "sm",
      contents: [
        {
          type: "span",
          text: `消耗女神石：${costGodStone}`,
        },
      ],
    });
  }

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
                  color: "#ffffff",
                  weight: "bold",
                },
              ],
            },
            {
              type: "box",
              layout: "vertical",
              contents: infoContents,
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
                      color: "#ebebeb",
                      size: "xs",
                    },
                    {
                      type: "text",
                      text: `${collectedCount}/${allCount}`,
                      color: "#ebebeb",
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
                      backgroundColor: "#DE5658",
                    },
                  ],
                  backgroundColor: "#9FD8E36E",
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
          backgroundColor: "#F987C5DD",
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
              color: "#ffffff",
              align: "center",
              size: "xs",
              offsetTop: "3px",
            },
          ],
          position: "absolute",
          cornerRadius: "20px",
          offsetTop: "18px",
          backgroundColor: "#ff334b",
          offsetStart: "12px",
          height: "25px",
          width: "70px",
        },
      ],
      paddingAll: "0px",
    },
  };

  return bubble;
}

/**
 * 產出轉蛋資訊
 * @param {Object} param
 * @param {Number} param.current 目前搜集角色數量
 * @param {Number} param.total  總共有多少角色
 * @param {Number} param.godStone 女神石數量
 * @param {Number} param.paidStone 有償女神石數量
 * @param {Number} param.gachaStarProgress 進度
 */
function genGachaStatus({
  current = 0,
  total,
  godStone = 0,
  paidStone = 0,
  gachaHistory,
  gachaStarProgress = 0,
}) {
  let collectPercent = total === 0 ? 0 : Math.round((current / total) * 100);

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "每日一抽進度",
          weight: "bold",
          align: "center",
        },
      ],
      paddingBottom: "0px",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "蒐集角色",
              flex: 2,
              size: "sm",
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  contents: [],
                  height: "5px",
                  backgroundColor: "#FFABCD",
                  width: `${collectPercent}%`,
                },
              ],
              backgroundColor: "#80808080",
              flex: 4,
              height: "5px",
              cornerRadius: "md",
            },
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: `${current}`,
                },
                {
                  type: "span",
                  text: "/",
                },
                {
                  type: "span",
                  text: `${total}`,
                },
              ],
              size: "xs",
              flex: 2,
              align: "end",
            },
          ],
          paddingTop: "xs",
          paddingBottom: "xs",
          spacing: "sm",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "累積星數",
              flex: 2,
              size: "sm",
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  contents: [],
                  height: "5px",
                  backgroundColor: "#FFEC8B",
                  width: `${gachaStarProgress}%`,
                },
              ],
              backgroundColor: "#80808080",
              flex: 4,
              height: "5px",
              cornerRadius: "md",
            },
            {
              type: "text",
              text: `${gachaStarProgress}%`,
              size: "xs",
              flex: 2,
              align: "end",
            },
          ],
          paddingTop: "xs",
          paddingBottom: "xs",
          spacing: "sm",
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: `${get(gachaHistory, "rainbow", 0)}`,
                  weight: "bold",
                },
                {
                  type: "span",
                  text: " ",
                },
                {
                  type: "span",
                  text: "天前出彩",
                },
              ],
              size: "sm",
              align: "center",
            },
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: `${get(gachaHistory, "hasNew", 0)}`,
                  weight: "bold",
                },
                {
                  type: "span",
                  text: " ",
                },
                {
                  type: "span",
                  text: "天前出新角",
                },
              ],
              size: "sm",
              align: "center",
            },
          ],
          paddingBottom: "xs",
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: "女神石",
                },
                {
                  type: "span",
                  text: " ",
                },
                {
                  type: "span",
                  text: `${godStone}`,
                  weight: "bold",
                },
              ],
              size: "sm",
              align: "center",
            },
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: "有償石",
                },
                {
                  type: "span",
                  text: " ",
                },
                {
                  type: "span",
                  text: `${paidStone}`,
                  weight: "bold",
                },
              ],
              size: "sm",
              align: "center",
            },
          ],
          paddingTop: "xs",
        },
      ],
    },
  };
}

function genCharacterImage(character) {
  const { url } = character;
  return {
    type: "image",
    url,
    size: "xs",
  };
}

function genCharacterRow(images) {
  return {
    type: "box",
    layout: "horizontal",
    contents: images,
  };
}

function genCharacterBubble(title, rows) {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: title,
        },
        ...rows,
      ],
      spacing: "md",
    },
  };
}

/**
 * 發送轉蛋結果訊息
 * @param {import("bottender").LineContext} context
 * @param {Object} objData
 * @param {Object} objData.rewards
 * @param {Object} objData.rareCount
 * @param {Object} objData.tag
 * @param {Object} DailyGachaInfo
 */
function showGachaResult(context, { rewards, rareCount, tag = "無" }, DailyGachaInfo) {
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
      { type: "span", text: tag },
    ],
    weight: "bold",
    align: "center",
  });

  let strReport = [];
  Object.keys(rareCount)
    .sort((a, b) => b - a)
    .forEach(key => {
      switch (key) {
        case "3":
          strReport.push(`彩*${rareCount[key]}`);
          break;
        case "2":
          strReport.push(`金*${rareCount[key]}`);
          break;
        case "1":
          strReport.push(`銀*${rareCount[key]}`);
          break;
      }
    });

  reportBox.contents.push({
    type: "text",
    text: strReport.join(" "),
    align: "center",
  });

  if (context.event.source.type === "group") {
    reportBox.contents.push({
      type: "text",
      text: "群組聊天室，每位成員限定120秒CD",
      size: "xxs",
      color: "#808080",
      align: "center",
    });
  }

  bubbleMessage.footer = reportBox;

  if (DailyGachaInfo === false) {
    context.replyFlex("轉蛋結果", bubbleMessage);
  } else {
    context.replyFlex("轉蛋結果", {
      type: "carousel",
      contents: [genDailyGacha(DailyGachaInfo), bubbleMessage],
    });
  }
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

  let strReport = [];
  Object.keys(rareCount)
    .sort((a, b) => b - a)
    .forEach(key => {
      switch (key) {
        case "3":
          strReport.push(`彩*${rareCount[key]}`);
          break;
        case "2":
          strReport.push(`金*${rareCount[key]}`);
          break;
        case "1":
          strReport.push(`銀*${rareCount[key]}`);
          break;
      }
    });

  reportBox.contents.push({
    type: "text",
    text: strReport.join(" "),
    align: "center",
  });

  if (hasCooldown) {
    reportBox.contents.push({
      type: "text",
      text: "群組聊天室，每位成員限定120秒CD",
      size: "xxs",
      color: "#808080",
      align: "center",
    });
  }

  bubbleMessage.footer = reportBox;

  return bubbleMessage;
}

exports.showGachaResult = showGachaResult;
exports.genGachaStatus = genGachaStatus;
exports.genCharacterImage = genCharacterImage;
exports.genCharacterRow = genCharacterRow;
exports.genCharacterBubble = genCharacterBubble;
exports.generateGachaResult = generateGachaResult;
exports.generateDailyGachaInfo = genDailyGacha;
