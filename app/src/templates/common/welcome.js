const { getLiffUri } = require(".");

const PuddingStatus = {
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "image",
        url: "https://i.imgur.com/SW3GwIA.png",
        size: "full",
        aspectMode: "cover",
        gravity: "top",
        aspectRatio: "7:9",
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
                size: "xl",
                color: "#ffffff",
                weight: "bold",
                contents: [
                  {
                    type: "span",
                    text: "布丁運行狀態",
                  },
                  {
                    type: "span",
                    text: " ",
                  },
                  {
                    type: "span",
                    text: "ON",
                    color: "#00FF00",
                  },
                ],
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "filler",
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "filler",
                  },
                  {
                    type: "text",
                    text: "首頁",
                    color: "#ffffff",
                    flex: 0,
                    offsetTop: "-2px",
                    weight: "bold",
                  },
                  {
                    type: "filler",
                  },
                ],
                spacing: "sm",
              },
              {
                type: "filler",
              },
            ],
            borderWidth: "3px",
            cornerRadius: "4px",
            spacing: "sm",
            borderColor: "#ffffff",
            margin: "xxl",
            height: "40px",
            action: {
              type: "uri",
              label: "action",
              uri: `${getLiffUri("full")}?reactRedirectUri=/`,
            },
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "filler",
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "filler",
                  },
                  {
                    type: "text",
                    text: "使用手冊",
                    color: "#ffffff",
                    flex: 0,
                    offsetTop: "-2px",
                    weight: "bold",
                  },
                  {
                    type: "filler",
                  },
                ],
                spacing: "sm",
              },
              {
                type: "filler",
              },
            ],
            borderWidth: "3px",
            cornerRadius: "4px",
            spacing: "sm",
            borderColor: "#ffffff",
            margin: "xxl",
            height: "40px",
            action: {
              type: "uri",
              label: "action",
              uri: `${getLiffUri("compact")}?reactRedirectUri=/Panel/Manual`,
            },
          },
        ],
        position: "absolute",
        offsetBottom: "0px",
        offsetStart: "0px",
        offsetEnd: "0px",
        backgroundColor: "#00bcd488",
        paddingAll: "20px",
        paddingTop: "18px",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "ON AIR",
            color: "#ffffff",
            align: "center",
            size: "xs",
            offsetTop: "3px",
          },
        ],
        position: "absolute",
        cornerRadius: "20px",
        offsetTop: "18px",
        backgroundColor: "#ff334b",
        offsetStart: "18px",
        height: "25px",
        width: "80px",
      },
    ],
    paddingAll: "0px",
  },
};

module.exports = context => {
  context.sendFlex("使用說明", PuddingStatus);
};
