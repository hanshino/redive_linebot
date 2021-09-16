const gachaTPL = {
  type: "bubble",
  body: { type: "box", layout: "vertical", spacing: "sm", contents: [] },
};

/**
 * 產出轉蛋頭像框
 * @param {Array} rewards
 */
function genGachaContent(rewards) {
  let bubbleMessage = JSON.parse(JSON.stringify(gachaTPL));
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
 * @param {Array}   DailyGachaInfo.NewCharacters
 * @param {Number}  DailyGachaInfo.GodStoneAmount
 * @param {Number}  DailyGachaInfo.collectedCount
 * @param {Number}  DailyGachaInfo.allCount
 * @param {Number}  DailyGachaInfo.OwnGodStone  擁有女神石
 * @param {Number}  DailyGachaInfo.costGodStone 消耗女神石
 */
function genDailyGacha({
  NewCharacters,
  GodStoneAmount,
  collectedCount,
  allCount,
  OwnGodStone,
  costGodStone,
}) {
  var collectRate = Math.round((collectedCount / allCount) * 10000) / 100;
  var bubble = {
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
              contents: [
                {
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
                },
                {
                  type: "text",
                  color: "#ebebeb",
                  size: "sm",
                  contents: [
                    {
                      type: "span",
                      text: `獲得女神石：${OwnGodStone} + ${GodStoneAmount} ${
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
                      contents: [
                        {
                          type: "filler",
                        },
                      ],
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

  NewCharacters.forEach(character => {
    bubble.body.contents[1].contents[1].contents[0].contents.push({
      type: "span",
      text: `${character.name} `,
    });
  });

  return bubble;
}

/**
 * 產出轉蛋資訊
 * @param {Object} param
 * @param {Number} param.current 目前搜集角色數量
 * @param {Number} param.total  總共有多少角色
 * @param {Number} param.godStone 女神石數量
 */
function genGachaStatus({ current = 0, total, godStone = 0 }) {
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
                  height: "10px",
                  backgroundColor: "#FFABCD",
                  width: `${Math.round((current / total) * 100)}%`,
                },
              ],
              backgroundColor: "#80808080",
              flex: 4,
              height: "10px",
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
          paddingTop: "md",
          paddingBottom: "md",
          spacing: "sm",
        },
        {
          type: "box",
          layout: "vertical",
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
                },
              ],
              size: "sm",
            },
          ],
          paddingTop: "md",
          paddingBottom: "md",
        },
      ],
    },
  };
}

module.exports = {
  /**
   * 發送轉蛋結果訊息
   * @param {LineContext} context
   * @param {Object} objData
   * @param {Object} objData.rewards
   * @param {Object} objData.rareCount
   * @param {Object} objData.tag
   * @param {Object} DailyGachaInfo
   */
  showGachaResult: function (context, { rewards, rareCount, tag = "無" }, DailyGachaInfo) {
    var bubbleMessage = genGachaContent(rewards);

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
      context.sendFlex("轉蛋結果", bubbleMessage);
    } else {
      context.sendFlex("轉蛋結果", {
        type: "carousel",
        contents: [genDailyGacha(DailyGachaInfo), bubbleMessage],
      });
    }
  },

  genGachaStatus,
};
