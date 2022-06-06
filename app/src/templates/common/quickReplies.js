const i18n = require("../../util/i18n");

exports.yes = {
  type: "action",
  action: {
    type: "message",
    label: i18n.__("template.yes"),
    text: "Y",
  },
};

exports.no = {
  type: "action",
  action: {
    type: "message",
    label: i18n.__("template.no"),
    text: "N",
  },
};
