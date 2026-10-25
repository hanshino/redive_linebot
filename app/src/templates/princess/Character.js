const { PALETTE, SEMANTIC, SURFACE } = require("../common/theme");
exports.generateRankupBubble = ({ beforeHeadImage, afterHeadImage, command, unitName }) => ({
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "image",
            url: beforeHeadImage,
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "image",
                url: "https://i.imgur.com/LTggbcZ.jpeg",
                size: "xs",
              },
              {
                type: "text",
                text: "→→→",
                align: "center",
                weight: "bold",
                size: "xs",
              },
            ],
            paddingTop: "lg",
          },
          {
            type: "image",
            url: afterHeadImage,
          },
        ],
        spacing: "md",
        justifyContent: "center",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "點我複製指令",
            align: "center",
            weight: "bold",
            size: "lg",
            color: PALETTE.white,
          },
        ],
        backgroundColor: SEMANTIC.primary.main,
        cornerRadius: "md",
        paddingAll: "lg",
        margin: "lg",
        action: {
          type: "clipboard",
          clipboardText: `!${command} ${unitName}`,
        },
      },
    ],
    backgroundColor: SURFACE.bgAlt,
    cornerRadius: "md",
  },
});
