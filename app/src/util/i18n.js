const i18n = require("i18n");
const path = require("path");
i18n.configure({
  locales: ["zh_tw"],
  directory: path.join(process.cwd(), "locales"),
  objectNotation: true,
  indent: "  ",
  updateFiles: false,
});

i18n.setLocale("zh_tw");

module.exports = i18n;
