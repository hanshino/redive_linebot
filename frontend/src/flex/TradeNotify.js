export const genNotify = ({ marketId, name, image, charge }) => ({
  type: "bubble",
  header: {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: "交易通知",
        weight: "bold",
      },
      {
        type: "text",
        text: `#${marketId}`,
        align: "end",
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
            type: "image",
            url: image,
            size: "full",
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: name,
                weight: "bold",
              },
              {
                type: "text",
                text: `$${charge}`,
                color: "#129912",
                weight: "bold",
                align: "end",
                size: "sm",
              },
              {
                type: "text",
                text: "您的好友向你發出交易請求",
                size: "xxs",
                wrap: true,
              },
            ],
            spacing: "sm",
            paddingAll: "md",
          },
        ],
        paddingAll: "sm",
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "拒絕",
                align: "center",
              },
            ],
            paddingAll: "md",
            backgroundColor: "#FF5656",
            cornerRadius: "md",
            action: {
              type: "uri",
              uri: `https://liff.line.me/${window.liff.id}?reactRedirectUri=/Trade/${marketId}/Transaction?action=deny`,
            },
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "接受",
                align: "center",
              },
            ],
            paddingAll: "md",
            cornerRadius: "md",
            backgroundColor: "#56FF56",
            action: {
              type: "uri",
              uri: `https://liff.line.me/${window.liff.id}?reactRedirectUri=/Trade/${marketId}/Transaction?action=transaction`,
            },
          },
        ],
        spacing: "md",
        paddingAll: "sm",
      },
    ],
  },
});
