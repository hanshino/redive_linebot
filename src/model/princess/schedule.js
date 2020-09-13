const fetch = require("node-fetch");
const redis = require("../../util/redis");
const memoryKey = "RandosoruEvents";

/**
 * 取得活動行事曆
 */
exports.getDatas = async () => {
  var datas = await redis.get(memoryKey);
  if (datas !== null) return datas;

  return fetch("https://pcredivewiki.tw/static/data/event.json")
    .then(res => res.json())
    .then(events => {
      redis.set(memoryKey, events, 60 * 60);
      return events;
    });
};
