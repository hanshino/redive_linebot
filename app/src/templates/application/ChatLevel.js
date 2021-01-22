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
    context.sendText(message);
  }

  context.sendText("為減少伺服器負擔，此訊息一分鐘只能查一次！");
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
