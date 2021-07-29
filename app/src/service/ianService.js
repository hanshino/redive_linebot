const axios = require("axios").default;

/**
 * 抓取特定戰隊的目前資訊
 * @param {Object} params 參數
 * @param {Number} params.server 伺服器
 * @param {String} params.leader_uid 隊長uid
 * @param {Number} params.page 頁數
 * @param {Number} params.ts 時間戳(s)
 * @return {Promise<Array|null>}
 */
exports.getClanBattleRank = params => {
  return axios
    .get(`${process.env.IAN_API_URL}/pcredive/clan/ranking`, {
      params,
    })
    .then(res => res.data)
    .catch(err => {
      console.error(err);
      return null;
    });
};
