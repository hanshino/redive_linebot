const bodyParser = require("body-parser");
const express = require("express");
const { bottender } = require("bottender");
const path = require("path");
const apiRouter = require("./src/router/api");
const cors = require("cors");
const { server, http } = require("./src/util/connection");
require("./src/router/socket");

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
  server.use(bodyParser.json({ verify }));
  server.use(bodyParser.urlencoded({ extended: false, verify }));
  server.use(express.static(path.join(`${__dirname}/public`)));

  // api group router
  server.use("/api", apiRouter);

  // route for webhook request
  server.all("*", (req, res) => {
    return handle(req, res);
  });

  http.listen(port, err => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});
