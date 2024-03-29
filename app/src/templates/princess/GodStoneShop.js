const common = require("../common");
const defaultHero = {
  type: "box",
  layout: "vertical",
  contents: [
    {
      type: "text",
      text: "尚未設定圖片",
      position: "absolute",
      size: "xl",
      color: "#808080",
      offsetTop: "45%",
      offsetStart: "30%",
    },
  ],
  height: "194px",
};

exports.genShopItem = function ({ itemId, image, name, price, star }) {
  const hero = image
    ? {
        type: "image",
        url: image,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
      }
    : defaultHero;

  return {
    type: "bubble",
    hero,
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: name,
              weight: "bold",
              size: "lg",
              flex: 2,
            },
            {
              type: "box",
              layout: "baseline",
              contents: Array.from({ length: 5 }, (v, i) => ({
                type: "icon",
                url:
                  star > i
                    ? "https://scdn.line-apps.com/n/channel_devcenter/img/fx/review_gold_star_28.png"
                    : "https://scdn.line-apps.com/n/channel_devcenter/img/fx/review_gray_star_28.png",
              })),
              flex: 1,
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "image",
                  url: "https://i.imgur.com/Xr1JU2z.png",
                  size: "xxs",
                  flex: 1,
                },
                {
                  type: "text",
                  gravity: "center",
                  flex: 8,
                  contents: [
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: "x",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: `${price}`,
                    },
                  ],
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
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "交換",
                  align: "center",
                  color: "#F2F3F4",
                },
              ],
              backgroundColor: "#1234FF56",
              paddingAll: "xl",
              cornerRadius: "md",
              borderColor: "#80808056",
              borderWidth: "normal",
            },
          ],
          action: {
            type: "uri",
            uri: `${common.getLiffUri(
              "full"
            )}?reactRedirectUri=/Gacha/Exchange?exchangeId=${itemId}`,
          },
          paddingTop: "lg",
        },
      ],
    },
  };
};
