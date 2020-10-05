const liffUri = `https://liff.line.me/${process.env.LINE_LIFF_ID}`;
/**
 * 顯示好友小卡
 * @param {Context} context
 * @param {Object} params
 * @param {String} params.uid
 * @param {String} params.server
 * @param {String} params.background
 * @param {String} params.nickname
 */
exports.showCard = (context, params) => {
  let { uid, server, background, nickname } = params;
  context.sendFlex("好友小卡", {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "image",
          url: background,
          size: "full",
          aspectMode: "cover",
          aspectRatio: "16:9",
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
                  text: server,
                  weight: "bold",
                  align: "center",
                  color: "#F62681",
                  size: "lg",
                },
                {
                  type: "text",
                  text: nickname,
                  align: "center",
                  weight: "bold",
                  wrap: true,
                },
              ],
              paddingAll: "5px",
              spacing: "md",
            },
            {
              type: "button",
              action: {
                type: "uri",
                label: "進遊戲",
                uri: "https://api-pc.so-net.tw/friend_invitation/index",
              },
            },
          ],
          backgroundColor: "#EBECF0CC",
          position: "absolute",
          offsetEnd: "5%",
          cornerRadius: "10px",
          height: "90%",
          offsetTop: "5%",
          paddingAll: "10px",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: [uid.substr(0, 3), uid.substr(3, 3), uid.substr(6)].join(" "),
              weight: "bold",
              size: "sm",
            },
          ],
          paddingAll: "3px",
          cornerRadius: "8px",
          position: "absolute",
          backgroundColor: "#FFC0CBCC",
          offsetTop: "3%",
          offsetStart: "3%",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "設定頁",
              size: "sm",
              align: "center",
              color: "#FFFFFF",
            },
          ],
          position: "absolute",
          offsetBottom: "5px",
          offsetStart: "5px",
          backgroundColor: "#808080CC",
          cornerRadius: "8px",
          width: "50px",
          action: {
            type: "uri",
            uri: `${liffUri}/Princess/Profile`,
          },
        },
      ],
      paddingAll: "0px",
    },
  });
};

exports.showBindingPage = context => {
  context.sendFlex("綁定訊息", {
    type: "bubble",
    size: "nano",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "尚未綁定\n馬上進行設定",
          align: "center",
          wrap: true,
          color: "#FFFFFF",
        },
      ],
      backgroundColor: "#E94196",
      action: {
        type: "uri",
        uri: `${liffUri}/Princess/Profile`,
      },
    },
  });
};
