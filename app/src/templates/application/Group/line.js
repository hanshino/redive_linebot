const liffUri = `https://liff.line.me/${process.env.LINE_LIFF_ID}`;

exports.showGroupStatus = context => {
  const { groupId } = context.event.source;
  const { groupName, count, pictureUrl } = context.state.groupDatas;

  context.sendFlex("群組管理", {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "image",
          url: "https://i.imgur.com/iCKr44R.jpg",
          size: "full",
          aspectMode: "cover",
          gravity: "top",
          aspectRatio: "3:4",
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
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "image",
                      url: pictureUrl,
                      size: "full",
                    },
                  ],
                  cornerRadius: "100px",
                  width: "72px",
                  height: "72px",
                  flex: 4,
                },
                {
                  type: "filler",
                  flex: 1,
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      contents: [
                        {
                          type: "span",
                          text: "名稱",
                          color: "#FFFFFF",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: groupName,
                          color: "#89CFF0",
                          weight: "bold",
                        },
                      ],
                      wrap: true,
                    },
                    {
                      type: "text",
                      contents: [
                        {
                          type: "span",
                          text: "人數",
                          color: "#FFFFFF",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: `${count || "?"}`,
                          color: "#89CFF0",
                          weight: "bold",
                        },
                      ],
                    },
                  ],
                  flex: 6,
                  paddingTop: "10px",
                },
              ],
              paddingAll: "10px",
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
                      text: "🏠布丁首頁",
                      color: "#ffffff",
                      align: "center",
                    },
                  ],
                  borderWidth: "3px",
                  borderColor: "#FFFFFF",
                  cornerRadius: "5px",
                  paddingAll: "10px",
                  action: {
                    type: "uri",
                    uri: liffUri,
                  },
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "🥁說話排行",
                      color: "#ffffff",
                      align: "center",
                    },
                  ],
                  borderWidth: "3px",
                  borderColor: "#FFFFFF",
                  cornerRadius: "5px",
                  paddingAll: "10px",
                  action: {
                    type: "uri",
                    uri: `${liffUri}?reactRedirectUri=/Group/${groupId}/Record`,
                  },
                },
              ],
              spacing: "md",
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
                      text: "📜戰隊簽到",
                      color: "#ffffff",
                      align: "center",
                    },
                  ],
                  borderWidth: "3px",
                  borderColor: "#FFFFFF",
                  cornerRadius: "5px",
                  paddingAll: "10px",
                  action: {
                    type: "uri",
                    uri: `${liffUri}?reactRedirectUri=/Group/${groupId}/Battle`,
                  },
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "📝自訂指令",
                      color: "#ffffff",
                      align: "center",
                    },
                  ],
                  borderWidth: "3px",
                  borderColor: "#FFFFFF",
                  cornerRadius: "5px",
                  paddingAll: "10px",
                  action: {
                    type: "uri",
                    uri: `${liffUri}?reactRedirectUri=/Source/${groupId}/Customer/Orders`,
                  },
                },
              ],
              spacing: "md",
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
                      text: "🔧設定",
                      color: "#ffffff",
                      align: "center",
                    },
                  ],
                  borderWidth: "3px",
                  borderColor: "#FFFFFF",
                  cornerRadius: "5px",
                  paddingAll: "10px",
                  action: {
                    type: "uri",
                    uri: `${liffUri}?reactRedirectUri=/Group/${groupId}/Config`,
                  },
                },
              ],
            },
          ],
          backgroundColor: "#9C8E7Ecc",
          paddingAll: "10px",
          position: "absolute",
          offsetEnd: "0px",
          offsetStart: "0px",
          offsetBottom: "0px",
          spacing: "lg",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "群組管理",
              size: "xs",
              color: "#ffffff",
            },
          ],
          position: "absolute",
          offsetTop: "18px",
          offsetEnd: "10px",
          cornerRadius: "20px",
          backgroundColor: "#89CFF0",
          paddingAll: "5px",
        },
      ],
      paddingAll: "0px",
    },
  });
};
