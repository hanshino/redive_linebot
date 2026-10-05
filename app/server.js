const path = require("path");
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: path.resolve(__dirname, "../.env"),
  });
}

const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const bot = require("./src/lib/bot");
const apiRouter = require("./src/router/api");
const { checkOriginConfig } = require("./src/service/AuthSessionService");
const { server, http, io } = require("./src/util/connection");
require("./src/router/socket");

// Surfaced at boot rather than on the first rejected request — a bad
// APP_DOMAIN fails closed and would otherwise look like a random 403 storm.
checkOriginConfig();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  keyGenerator: req => {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const [ip] = forwarded.split(",");
      return ip;
    }
    return ipKeyGenerator(req);
  },
});

const port = Number(process.env.PORT) || 9527;

console.log(`> Bot engine: ${bot.engine}`);
let webhook;
let handle;
let prepared;
if (bot.engine === "native") {
  webhook = bot.mountWebhook(server, {
    app: require("./index"),
    errorHandler: require("./_error"),
    initialState: require("./bottender.config").initialState,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  });
  prepared = Promise.resolve();
} else {
  const app = bot.bottender({ dev: process.env.NODE_ENV !== "production" });
  handle = app.getRequestHandler();
  prepared = app.prepare();
}

prepared.then(() => {
  const verify = (req, _, buf) => {
    req.rawBody = buf.toString();
  };

  // No CORS middleware: auth is a same-origin HttpOnly cookie, and the old
  // wildcard `cors()` would have handed any origin a credentialed read path.
  server.use(express.json({ verify, limit: "3mb" }));
  server.use(express.urlencoded({ extended: false, verify }));

  server.use("/bot-assets", express.static(path.join(__dirname, "assets")));

  // api group router
  server.use("/api", limiter, apiRouter);

  // route for webhook request
  server.all("*", (req, res) => {
    return handle ? handle(req, res) : res.sendStatus(404);
  });

  http.listen(port, err => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});

if (webhook) {
  process.once("SIGTERM", () => {
    const closed = new Promise(resolve => http.close(resolve));
    io.close();
    Promise.all([closed, webhook.drain()]).then(
      () => process.exit(0),
      error => {
        console.error("Native shutdown failed", { name: error.name, code: error.code });
        process.exit(1);
      }
    );
  });
}
