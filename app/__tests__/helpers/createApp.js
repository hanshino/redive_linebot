const express = require("express");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/api", require("../../src/router/api"));
  return app;
}

module.exports = createApp;
