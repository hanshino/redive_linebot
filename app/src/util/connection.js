const express = require("express");
const server = express();

exports.server = server;
exports.http = require("http").createServer(this.server);

exports.io = require("socket.io").listen(this.http, {
  log: false,
  agent: false,
  origins: "*:*",
  transports: ["websocket"],
});
