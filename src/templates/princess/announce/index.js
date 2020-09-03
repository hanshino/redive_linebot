/**
 * 發送公告訊息
 * @param {Context} context
 * @param {Array} announceDatas
 */
exports.showAnnounce = (context, announceDatas) => {
  var carousel = {
    type: "carousel",
    contents: [],
  };

  announceDatas.slice(0, 10).forEach(data => {
    let bubble = {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        action: {
          type: "uri",
          uri: `${data.href}`,
        },
        contents: [
          {
            type: "image",
            url: "https://i.imgur.com/GdCyxyQ.png",
            position: "absolute",
            offsetTop: "-10px",
            aspectRatio: "16:9",
            offsetEnd: "10px",
          },
          {
            type: "text",
            text: `${data.title}`,
            color: "#399be6",
          },
          {
            type: "text",
            text: `${data.content}`,
            wrap: true,
            color: "#399be6",
          },
        ],
      },
    };

    carousel.contents.push(bubble);
  });

  let sender = {
    name: "公主秘書",
    iconUrl: "https://i.imgur.com/BOzOY40.jpg",
  };

  context.sendFlex("最新官方公告", carousel, { sender });
};
