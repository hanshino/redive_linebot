const common = require("../common");

exports.generateScratchCard = ({ title, maxPrize, price, image, link }) => {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "image",
          url: image,
          size: "full",
          aspectMode: "cover",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: title,
                  weight: "bold",
                  color: "#FFFFFF",
                },
                {
                  type: "text",
                  text: `${price}$`,
                  align: "end",
                  color: "#FFFFFF",
                },
              ],
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: `最高獎金 ${maxPrize}$`,
                  color: "#FFFFFF",
                },
              ],
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "前往購買",
                  color: "#FFFFFF",
                  align: "center",
                },
              ],
              paddingAll: "lg",
              borderWidth: "normal",
              borderColor: "#FFFFFF",
              cornerRadius: "md",
              margin: "md",
              action: {
                type: "uri",
                uri: link,
              },
            },
          ],
          paddingAll: "xl",
          backgroundColor: "#808080AC",
          position: "absolute",
          width: "100%",
          offsetBottom: "none",
        },
      ],
      paddingAll: "none",
    },
  };
};

exports.generateScratchCardPanel = () => ({
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "image",
        url: "https://i.imgur.com/le7f06v.jpg",
        aspectMode: "cover",
        aspectRatio: "20:16",
        size: "full",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "網頁版",
                align: "center",
                color: "#FFFFFF",
              },
            ],
            paddingAll: "md",
            borderColor: "#FFFFFF",
            borderWidth: "medium",
            cornerRadius: "md",
            action: {
              type: "uri",
              uri: common.getLiffUri("full", "/ScratchCard"),
            },
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "獎金兌換",
                align: "center",
                color: "#FFFFFF",
              },
            ],
            paddingAll: "md",
            borderColor: "#FFFFFF",
            borderWidth: "medium",
            cornerRadius: "md",
            action: {
              type: "uri",
              uri: common.getLiffUri("full", "/ScratchCard/Exchange"),
            },
          },
        ],
        position: "absolute",
        backgroundColor: "#808080dc",
        offsetBottom: "none",
        width: "100%",
        paddingAll: "lg",
        spacing: "md",
      },
    ],
    paddingAll: "none",
  },
});

exports.generateTableRow = ({ name, reward, count }) => ({
  type: "box",
  layout: "horizontal",
  contents: [
    {
      type: "text",
      text: `${name}`,
      align: "center",
    },
    {
      type: "text",
      text: `${reward}`,
      align: "center",
    },
    {
      type: "text",
      text: `${count}`,
      align: "center",
    },
  ],
});

exports.generateScratchCardUnusedTable = (userId, rows) => ({
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "兌換結果",
        weight: "bold",
      },
    ],
    paddingBottom: "none",
  },
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: "#",
            weight: "bold",
            size: "sm",
            align: "center",
          },
          {
            type: "text",
            text: "獎勵",
            weight: "bold",
            size: "sm",
            align: "center",
          },
          {
            type: "text",
            text: "數量",
            weight: "bold",
            size: "sm",
            align: "center",
          },
        ],
      },
      {
        type: "separator",
      },
      ...rows,
    ],
    spacing: "xs",
  },
  footer: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "一鍵兌換",
            align: "center",
          },
        ],
        paddingAll: "md",
        backgroundColor: "#ff343524",
        cornerRadius: "xl",
        action: {
          type: "postback",
          data: JSON.stringify({
            action: "exchangeScratchCard",
            sourceId: userId,
          }),
        },
      },
    ],
  },
});
