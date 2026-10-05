if (process.env.BOT_ENGINE !== undefined && process.env.BOT_ENGINE !== "native") {
  throw new Error(
    `Unsupported BOT_ENGINE: ${process.env.BOT_ENGINE}. Only native is supported; unset BOT_ENGINE or set it to native.`
  );
}

module.exports = { ...require("./native"), engine: "native" };
