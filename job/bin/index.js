const notify = require("../lib/notify");
exports.CustomerOrder = require("./CustomerOrder");
exports.Group = require("./Group");
exports.Event = require("./Event");
exports.Notify = require("./Notify");
exports.Spider = require("./Spider");

exports.heartbeat = () => {
  let now = new Date();
  let strNow = [
    now.getFullYear(),
    (now.getMonth() + 1).toString().padStart(2, '0'),
    now.getDate().toString().padStart(2, '0'),
  ].join("/") + " " + [
    now.getHours().toString().padStart(2, '0'),
    now.getMinutes().toString().padStart(2, '0'),
    now.getSeconds().toString().padStart(2, '0'),
  ].join(":");

  notify.push({
    message: `${strNow} 心跳ping-pong`,
    alert: false,
  });
}
