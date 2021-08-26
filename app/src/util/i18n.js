const i18n = require("i18n");
const path = require("path");
i18n.configure({
  locales: ["zh_tw"],
  directory: path.join(require.main.path, "locales"),
  objectNotation: true,
});

i18n.setLocale("zh_tw");

module.exports = i18n;
