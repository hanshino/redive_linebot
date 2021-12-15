const express = require("express");
const rateLimit = require("express-rate-limit");
const { bottender } = require("bottender");
const apiRouter = require("./src/router/api");
const cors = require("cors");
const { server, http } = require("./src/util/connection");
require("./src/router/socket");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
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
  server.use(express.json({ verify }));
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
