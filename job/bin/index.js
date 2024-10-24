const axios = require("axios").default;
exports.CustomerOrder = require("./CustomerOrder");
exports.Group = require("./Group");
exports.Event = require("./Event");
exports.ChatLevel = require("./ChatLevel");
exports.Advancement = require("./Advancement");

exports.test = () => {
  return axios
    .get("http://python:3000")
    .then(res => res.data)
    .then(res => {
      console.log(res);
    });
};
