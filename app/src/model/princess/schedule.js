const { default: axios } = require("axios");
const redis = require("../../util/redis");
const memoryKey = "RandosoruEvents";

/**
 * 取得活動行事曆
 */
exports.getDatas = async () => {
  var datas = await redis.get(memoryKey);
  if (datas !== null) return datas;

  return axios.get("https://www.randosoru.com/api/events").then(res => {
    redis.set(memoryKey, res.data);
    return res.data;
  });
};
