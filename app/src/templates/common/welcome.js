const { getLiffUri } = require(".");
const config = require("config");
const { PALETTE, SEMANTIC, SURFACE } = require("./theme");

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
                      backgroundColor: SEMANTIC.success.main,
                      height: "100%",
                      width: `${progress}%`,
                    },
                  ],
                  backgroundColor: SURFACE.bgMuted,
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
              color: SURFACE.textMuted,
            },
          ],
        },
        genRowButtons([
          genLinkButton("首頁", SEMANTIC.primary.main, `${getLiffUri("full")}`),
          genLinkButton("使用手冊", SEMANTIC.primary.main, `${getLiffUri("tall")}/panel/manual`),
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
        color: PALETTE.white,
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
  context.replyFlex("布丁機器人使用說明", genPuddingStatus());
};
