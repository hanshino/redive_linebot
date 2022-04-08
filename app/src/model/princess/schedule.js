const { default: axios } = require("axios");
const redis = require("../../util/redis");
const memoryKey = "RandosoruEvents";

/**
 * 取得活動行事曆
 */
exports.getDatas = async () => {
  var datas = await redis.get(memoryKey);
  if (datas !== null) return JSON.parse(datas);

  const res = await axios.get("https://pcredivewiki.tw/static/data/event.json");
  redis.set(memoryKey, JSON.stringify(res.data));
  return res.data;
};
