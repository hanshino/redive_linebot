const { getLiffUri } = require(".");
const config = require("config");

function genPuddingStatus() {
  const availableFunds = config.get("app.funds.available") || 0;
  const serverFunds = config.get("app.funds.server") || 0;
  const progress =
    availableFunds && serverFunds ? Math.round((availableFunds / serverFunds) * 100) : 0;
  return {
    type: "bubble",
    hero: {
      type: "image",
      url: "https://i.imgur.com/SW3GwIA.png",
      aspectRatio: "16:10",
      size: "full",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
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
                  text: "伺服器資金",
                  size: "sm",
                  align: "center",
                  flex: 4,
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "box",
                      layout: "vertical",
                      contents: [],
                      backgroundColor: "#56FF56",
                      height: "100%",
                      width: `${progress}%`,
                    },
                  ],
                  backgroundColor: "#808080",
                  cornerRadius: "lg",
                  height: "10px",
                  flex: 8,
                },
              ],
              alignItems: "center",
            },
            {
              type: "text",
              align: "end",
              contents: [
                {
                  type: "span",
                  text: `${availableFunds}`,
                },
                {
                  type: "span",
                  text: " / ",
                },
                {
                  type: "span",
                  text: `${serverFunds}`,
                },
              ],
              size: "xs",
              color: "#808080",
            },
          ],
        },
        genRowButtons([
          genLinkButton("首頁", "#00bcd488", `${getLiffUri("full")}`),
          genLinkButton(
            "使用手冊",
            "#00bcd488",
            `${getLiffUri("tall")}?reactRedirectUri=/Panel/Manual`
          ),
          genLinkButton(
            "訊息訂閱",
            "#00bcd488",
            `${getLiffUri("tall")}?reactRedirectUri=/Bot/Notify`
          ),
        ]),
        genRowButtons([
          genLinkButton("GitHub", config.get("color.github"), config.get("links.github")),
          genLinkButton("巴哈姆特", config.get("color.bahamut"), config.get("links.bahamut")),
        ]),
      ],
      spacing: "sm",
    },
  };
}

function genRowButtons(buttons) {
  return {
    type: "box",
    layout: "horizontal",
    contents: buttons,
    spacing: "md",
    margin: "md",
  };
}

function genLinkButton(text, color, link) {
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: text,
        align: "center",
        weight: "bold",
        color: "#FFFFFF",
        size: "sm",
        gravity: "center",
      },
    ],
    paddingAll: "lg",
    cornerRadius: "xl",
    backgroundColor: color,
    action: {
      type: "uri",
      uri: link,
    },
  };
}

module.exports = context => {
  context.replyFlex("使用說明", genPuddingStatus());
};
