const bodyParser = require("body-parser");
const express = require("express");
const { bottender } = require("bottender");
const path = require("path");
const apiRouter = require("./src/router/api");
const cors = require("cors");
const { server, http } = require("./src/util/connection");
const { binding } = require("./src/controller/application/NotifyController").api;
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

  server.get("/Bot/Notify/Callback", binding);

  server.get("/send-id", (req, res) => {
    const { size } = req.query;
    let liffId = "";

    switch (size.toLowerCase()) {
      case "compact":
        liffId = process.env.LINE_LIFF_COMPACT_ID;
        break;
      case "tall":
        liffId = process.env.LINE_LIFF_TALL_ID;
        break;
      case "full":
        liffId = process.env.LINE_LIFF_FULL_ID;
        break;
    }

    liffId = liffId || process.env.LINE_LIFF_ID;

    res.json({ id: liffId });
  });

  server.get("/*", (req, res) => {
    res.sendFile(path.join(`${__dirname}/public/index.html`));
  });

  // route for webhook request
  server.all("*", (req, res) => {
    return handle(req, res);
  });

  http.listen(port, err => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});
