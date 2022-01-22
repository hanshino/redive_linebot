const redis = require("../util/redis");
const config = require("config");

// EventCenterService 處理事件的服務，這裡將會把事件做成類似廣播的方式
// 必須要由 crontab 進行事件處理，類似於一個事件中心處理器

exports.add = async function (name, payload) {
  // 將事件存入 redis
  await redis.enqueue(name, JSON.stringify(payload), config.get("event.expire"));
};

exports.getEventName = function (name) {
  return `event_center:${config.get(`event.${name}`)}`;
};
