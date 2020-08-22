exports.showGroupStatus = context => {
  var liffUri = `https://liff.line.me/${process.env.LINE_LIFF_ID}`;

  context.sendFlex("群組管理", {
    type: "carousel",
    contents: [
      {
        type: "bubble",
        size: "nano",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "群組排行",
              color: "#FFFFFF",
              align: "center",
            },
          ],
          backgroundColor: "#555555",
          action: {
            type: "uri",
            uri: `${liffUri}/Group/${context.event.source.groupId}/Record`,
          },
        },
      },
      {
        type: "bubble",
        size: "nano",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "群組設定",
              color: "#FFFFFF",
              align: "center",
              action: {
                type: "uri",
                uri: `${liffUri}/Group/${context.event.source.groupId}/Config`,
              },
            },
          ],
          backgroundColor: "#555555",
        },
      },
      {
        type: "bubble",
        size: "nano",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "自訂指令",
              color: "#FFFFFF",
              align: "center",
              action: {
                type: "uri",
                uri: `${liffUri}/Source/${context.event.source.groupId}/Customer/Orders`,
              },
            },
          ],
          backgroundColor: "#555555",
        },
      }
    ],
  });
};
