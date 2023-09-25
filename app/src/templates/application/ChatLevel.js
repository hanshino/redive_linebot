const humanNumber = require("human-number");

exports.showStatus = param => {
  let { displayName, range, rank, level, ranking, expRate, pictureUrl, exp, achievement } = param;

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: achievement,
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
          layout: "horizontal",
          contents: [
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "image",
                      url: pictureUrl,
                    },
                  ],
                  width: "100%",
                  cornerRadius: "100px",
                },
                {
                  type: "text",
                  text: `${displayName}`,
                  align: "center",
                  weight: "bold",
                  margin: "md",
                  size: "xs",
                },
              ],
              flex: 1,
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
                      text: `${range} 的 ${rank}`,
                      weight: "bold",
                      size: "sm",
                    },
                  ],
                  paddingEnd: "3px",
                },
                {
                  type: "separator",
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
                          text: "Level",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: `${level}`,
                        },
                      ],
                    },
                    {
                      type: "text",
                      contents: [],
                      size: "xxs",
                      gravity: "bottom",
                      color: "#808080",
                      text: humanNumber(exp, n => Number.parseFloat(n).toFixed(1)),
                      align: "end",
                    },
                  ],
                  paddingStart: "3px",
                  paddingEnd: "3px",
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "box",
                      layout: "vertical",
                      contents: [],
                      backgroundColor: "#80FF80",
                      width: `${expRate}%`,
                      height: "15px",
                      cornerRadius: "sm",
                    },
                  ],
                },
              ],
              paddingStart: "10px",
              spacing: "sm",
              flex: 2,
            },
          ],
        },
        {
          type: "text",
          text: `Rank #${ranking}`,
          size: "xxs",
          color: "#808080",
          position: "absolute",
          offsetEnd: "10px",
          offsetBottom: "3px",
        },
      ],
    },
  };
};

/**
 * 發送排行榜訊息
 * @param {Context} context
 * @param {Object} param
 * @param {Array} param.rankData
 * @param {String} param.sendType
 */
exports.showTopRank = (context, { rankData, sendType }) => {
  let message = sendType === "text" ? genTextTopRank(rankData) : genTextTopRank(rankData);

  if (sendType === "text") {
    context.replyText(message);
  }

  context.replyText("為減少伺服器負擔，此訊息一分鐘只能查一次！");
};

/**
 * 產生文字型排行榜
 * @param {Array<{experience: Number, level: Number, rank: String, range: String}>} rankData
 * @returns {Object<{type: String, text: String}>}
 */
function genTextTopRank(rankData) {
  let result = "";

  result = rankData
    .map((data, index) => [index + 1, `${data.level}等`, `${data.range}的${data.rank}`].join("\t"))
    .join("\n");

  return `>>Pudding World<<\n${result}`;
}
