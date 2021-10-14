const PreWorkMessage = {
  type: "bubble",
  hero: {
    type: "image",
    url: "https://i.imgur.com/tNKugzO.jpg",
    size: "full",
    aspectRatio: "16:9",
    action: {
      type: "uri",
      label: "action",
      uri: "https://forum.gamer.com.tw/C.php?bsn=30861&snA=7222",
    },
  },
};

exports.sendPreWorkMessage = context => {
  context.replyFlex("前作劇情", PreWorkMessage);
};
