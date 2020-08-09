const bodyParser = require("body-parser");
const express = require("express");
const { bottender } = require("bottender");
const path = require("path");
const apiRouter = require("./src/router/api");

const app = bottender({
  dev: process.env.NODE_ENV !== "production",
});

const port = Number(process.env.PORT) || 5000;

// the request handler of the bottender app
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();

  const verify = (req, _, buf) => {
    req.rawBody = buf.toString();
  };
  server.use(bodyParser.json({ verify }));
  server.use(bodyParser.urlencoded({ extended: false, verify }));

  // api group router
  server.use("/api", apiRouter);

  server.get("/send-id", (req, res) => {
    res.json({ id: process.env.LINE_LIFF_ID });
  });

  server.get("/liff", (req, res) => {
    const filename = path.join(`${__dirname}/liff.html`);
    res.sendFile(filename);
  });

  // route for webhook request
  server.all("*", (req, res) => {
    return handle(req, res);
  });

  server.listen(port, err => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});
