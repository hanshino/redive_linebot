const i18n = require("../../util/i18n");

exports.generateGambleGame = rows => {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        ...rows,
        {
          type: "text",
          text: i18n.__("message.gamble.usage"),
          color: "#808080",
          size: "sm",
          align: "center",
          margin: "md",
        },
      ],
    },
  };
};

exports.generateOptionsRow = boxes => {
  return {
    type: "box",
    layout: "horizontal",
    contents: boxes,
  };
};

exports.generateOptionBox = (index, image, percentage, amount) => {
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: `${index}`,
        align: "center",
      },
      {
        type: "image",
        url: image,
      },
      {
        type: "text",
        text: `${percentage}%`,
        align: "center",
        size: "sm",
        color: "#808080",
      },
      {
        type: "separator",
      },
      {
        type: "text",
        text: `${amount}`,
        align: "center",
        size: "sm",
        color: "#808080",
      },
    ],
    paddingAll: "sm",
  };
};
