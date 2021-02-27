export default {
  genFlex(params) {
    let { uid, serverName: server, background, nickname } = params;

    return {
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
              uri: `https://liff.line.me/${window.liff.id}/Princess/Profile`,
            },
          },
        ],
        paddingAll: "0px",
      },
    };
  },
};
