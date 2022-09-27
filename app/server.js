const express = require("express");
const rateLimit = require("express-rate-limit");
const { bottender } = require("bottender");
const apiRouter = require("./src/router/api");
const cors = require("cors");
const { server, http } = require("./src/util/connection");
const { handleGameData } = require("./src/task");
const ClanFetch = require("./bin/ClanFetch");
const cron = require("cron").CronJob;
require("./src/router/socket");

// 定時更新 game data
// 只在早上 9:00 ~ 晚上 21:00 更新
new cron(
  "0 5 9-21 * * *",
  async () => {
    await handleGameData();
  },
  null,
  true,
  "Asia/Taipei"
);

// 戰隊期間 每五分鐘抓一次排名資料
new cron(
  "0 */5 * 20-31 * *",
  async () => {
    await ClanFetch();
  },
  null,
  process.env.NODE_ENV === "production",
  "Asia/Taipei"
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  keyGenerator: req => {
    const [ip] = req.headers["x-forwarded-for"].split(",");
    return ip;
  },
});

const app = bottender({
  dev: process.env.NODE_ENV !== "production",
});

const port = Number(process.env.PORT) || 5000;

// the request handler of the bottender app
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const verify = (req, _, buf) => {
    req.rawBody = buf.toString();
  };

  server.use(cors());
  server.use(express.json({ verify, limit: "3mb" }));
  server.use(express.urlencoded({ extended: false, verify }));

  // api group router
  server.use("/api", limiter, apiRouter);

  // route for webhook request
  server.all("*", (req, res) => {
    return handle(req, res);
  });

  http.listen(port, err => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});
