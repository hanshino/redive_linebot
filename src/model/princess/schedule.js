const fetch = require("node-fetch");
const memory = require("memory-cache");
const memoryKey = "RandosoruEvents";

/**
 * 取得活動行事曆
 */
exports.getDatas = async () => {
  var datas = memory.get(memoryKey);
  if (datas !== null) return datas;

  return fetch("https://pcredivewiki.tw/static/data/event.json")
    .then(res => res.json())
    .then(events => {
      memory.put(memoryKey, events, 60 * 60 * 1000);
      return events;
    });
};
