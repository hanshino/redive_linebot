const log4js = require("log4js");

log4js.configure({
  appenders: {
    std: { type: "stdout", level: "all", layout: { type: "basic" } },
    file: {
      type: "dateFile",
      filename: `${__dirname}/../../error_log.log`,
      keepFileExt: true,
      encoding: "utf-8",
      compress: true,
      pattern: ".yyyMMdd",
    },
  },
  categories: {
    default: { appenders: ["std"], level: "debug" },
    custom: { appenders: ["std", "file"], level: "all" },
  },
});

exports.CustomLogger = log4js.getLogger("custom");
exports.DefaultLogger = log4js.getLogger("default");
