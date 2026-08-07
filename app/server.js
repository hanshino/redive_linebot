const path = require("path");
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: path.resolve(__dirname, "../.env"),
  });
}

const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { bottender } = require("bottender");
const apiRouter = require("./src/router/api");
const { checkOriginConfig } = require("./src/service/AuthSessionService");
const { server, http } = require("./src/util/connection");
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

const app = bottender({
  dev: process.env.NODE_ENV !== "production",
});

const port = Number(process.env.PORT) || 9527;

// the request handler of the bottender app
const handle = app.getRequestHandler();

app.prepare().then(() => {
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
    return handle(req, res);
  });

  http.listen(port, err => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});
