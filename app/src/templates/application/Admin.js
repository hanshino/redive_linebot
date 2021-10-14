const liffUri = `https://liff.line.me/${process.env.LINE_LIFF_ID}`;

exports.showManagePlace = context => {
  context.replyFlex("管理員頁面", {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "image",
          url: "https://i.imgur.com/5pcsFME.jpg",
          size: "4xl",
          aspectMode: "cover",
          aspectRatio: "2:3",
          gravity: "top",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: "管理員頁面", size: "xl", color: "#ffffff", weight: "bold" },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "button",
                      action: {
                        type: "uri",
                        label: "指令管理",
                        uri: `${liffUri}?reactRedirectUri=/Admin/GlobalOrder`,
                      },
                      style: "secondary",
                    },
                    {
                      type: "button",
                      action: {
                        type: "uri",
                        label: "卡池管理",
                        uri: `${liffUri}?reactRedirectUri=/Admin/GachaPool`,
                      },
                      style: "secondary",
                    },
                  ],
                  paddingAll: "2px",
                  spacing: "md",
                },
              ],
            },
          ],
          offsetBottom: "0px",
          offsetStart: "0px",
          offsetEnd: "0px",
          backgroundColor: "#03303Acc",
          paddingAll: "20px",
          paddingTop: "18px",
          position: "absolute",
        },
      ],
      paddingAll: "0px",
    },
  });
};
