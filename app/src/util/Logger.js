const log4js = require("log4js");

const isProduction = process.env.NODE_ENV === "production";
const defaultLevel = isProduction ? "info" : "debug";
const level = process.env.LOG_LEVEL || defaultLevel;

const layout = isProduction
  ? { type: "pattern", pattern: "[%d{ISO8601}] [%p] %c - %m" }
  : { type: "basic" };

log4js.configure({
  appenders: {
    std: { type: "stdout", layout },
  },
  categories: {
    default: { appenders: ["std"], level },
    custom: { appenders: ["std"], level },
  },
});

exports.CustomLogger = log4js.getLogger("custom");
exports.DefaultLogger = log4js.getLogger("default");
