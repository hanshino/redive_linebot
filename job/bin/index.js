const notify = require("../lib/notify");
const axios = require("axios").default;
exports.CustomerOrder = require("./CustomerOrder");
exports.Group = require("./Group");
exports.Event = require("./Event");
exports.Notify = require("./Notify");
exports.Spider = require("./Spider");
exports.ChatLevel = require("./ChatLevel");
exports.Advancement = require("./Advancement");

exports.heartbeat = () => {
  let now = new Date();
  let strNow =
    [
      now.getFullYear(),
      (now.getMonth() + 1).toString().padStart(2, "0"),
      now.getDate().toString().padStart(2, "0"),
    ].join("/") +
    " " +
    [
      now.getHours().toString().padStart(2, "0"),
      now.getMinutes().toString().padStart(2, "0"),
      now.getSeconds().toString().padStart(2, "0"),
    ].join(":");

  return notify.push({
    message: `${strNow} 心跳ping-pong`,
    alert: false,
  });
};

exports.test = () => {
  return axios
    .get("http://python:3000")
    .then(res => res.data)
    .then(res => {
      console.log(res);
    });
};
