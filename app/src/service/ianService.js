const axios = require("axios").default;
const { DefaultLogger } = require("../util/Logger");

/**
 * 抓取特定戰隊的目前資訊
 * @param {Object} params 參數
 * @param {Number} params.server 伺服器
 * @param {String} params.leader_uid 隊長uid
 * @param {String} params.month 頁數
 * @return {Promise<Array|null>}
 */
exports.getClanBattleRank = params => {
  DefaultLogger.info(
    `fetch => ${process.env.IAN_API_URL}/clan/ranking/${
      params.server
    }/search, params => ${JSON.stringify(params)}`
  );
  return axios
    .get(`${process.env.IAN_API_URL}/clan/ranking/${params.server}/search`, {
      params,
    })
    .then(res => res.data)
    .catch(err => {
      console.error(err);
      return null;
    });
};

/**
 * 抓取該伺服器一定區間的紀錄
 * @param {Object} params 參數
 * @param {Number} params.server
 * @param {Number} params.page
 * @param {Number} params.ts_start
 * @returns {Promise<Array|null>}
 */
exports.getClanBattleServerRank = params => {
  DefaultLogger.info(
    `fetch => ${process.env.IAN_API_URL}/clan/ranking/${params.server}, params => ${JSON.stringify(
      params
    )}`
  );
  return axios
    .get(`${process.env.IAN_API_URL}/clan/ranking/${params.server}`, {
      params,
    })
    .then(res => res.data)
    .catch(err => {
      console.error(err);
      return null;
    });
};
