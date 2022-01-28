const config = require("config");
const defaultOptionColor = config.get("vote.default.color.option");

exports.generateVote = function ({ id, banner_url, description, options }) {
  const bubble = {
    type: "bubble",
    hero: {
      type: "image",
      url: banner_url,
      size: "full",
      aspectMode: "fit",
      aspectRatio: "16:9",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: description,
          wrap: true,
          size: "xxs",
        },
      ],
      spacing: "md",
    },
  };

  const buttons = options.map(option => makeButton({ id, ...option }));

  bubble.body.contents.push(...buttons);

  return bubble;
};

function makeButton({ id, color = defaultOptionColor, option, content }) {
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: `${content}`,
        size: "sm",
        align: "center",
        color: "#FFFFFF",
      },
    ],
    paddingAll: "md",
    backgroundColor: color,
    cornerRadius: "md",
    action: {
      type: "postback",
      data: JSON.stringify({
        id,
        action: "vote",
        option,
      }),
    },
  };
}
