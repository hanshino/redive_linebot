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
            type: "text",
            text: "➡️",
            gravity: "center",
            align: "center",
            size: "xxl",
            weight: "bold",
            color: "#888888",
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
            color: "#ffffff",
          },
        ],
        backgroundColor: "#4C50AF",
        cornerRadius: "md",
        paddingAll: "lg",
        margin: "lg",
        action: {
          type: "clipboard",
          clipboardText: `!${command} ${unitName}`,
        },
      },
    ],
    backgroundColor: "#F5F5F5",
    cornerRadius: "md",
  },
});
