const { assemble } = require("../../common");
const eventTPL = {
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    contents: [
      { type: "text", text: "{TITLE}", weight: "bold", align: "center", size: "lg" },
      {
        type: "text",
        text: "所有資料取自於：蘭德索爾圖書館",
        position: "absolute",
        offsetTop: "7px",
        offsetStart: "5px",
        size: "xxs",
        color: "#A9A9A9",
        decoration: "underline",
      },
    ],
  },
  body: { type: "box", layout: "vertical", contents: [], spacing: "md" },
};
const eventBox = {
  type: "box",
  layout: "vertical",
  contents: [
    { type: "text", text: "{title}" },
    {
      type: "text",
      contents: [
        { type: "span", text: "開始時間：" },
        { type: "span", text: "{start}", weight: "bold", color: "#616771" },
      ],
      size: "xs",
      margin: "md",
    },
    {
      type: "text",
      contents: [
        { type: "span", text: "結束時間：" },
        { type: "span", text: "{end}", weight: "bold", color: "#616771" },
      ],
      size: "xs",
    },
    {
      type: "text",
      contents: [
        { type: "span", text: "{thirdTitle}：" },
        { type: "span", text: "{distance}", weight: "bold", color: "#616771" },
      ],
      size: "xs",
    },
  ],
};

exports.showSchedule = (context, EventDatas) => {
  var objEventMsg = {};

  if (EventDatas.HoldingEvent.length !== 0) {
    objEventMsg.HoldingEvent = genEventMessage(
      EventDatas.HoldingEvent,
      "正在舉辦的活動",
      "距離結束"
    );
    objEventMsg.HoldingEvent.hero = {
      type: "image",
      url: "https://i.imgur.com/9lQy4UZ.jpg",
      size: "full",
      aspectMode: "fit",
      aspectRatio: "16:9",
    };
  }

  if (EventDatas.FutureEvent.length !== 0) {
    objEventMsg.FutureEvent = genEventMessage(EventDatas.FutureEvent, "即將舉辦的活動", "距離開始");
    objEventMsg.FutureEvent.hero = {
      type: "image",
      url: "https://i.imgur.com/yPCcB13.jpg",
      size: "full",
      aspectMode: "fit",
      aspectRatio: "16:9",
    };
  }

  if (EventDatas.ExpireEvent.length !== 0) {
    objEventMsg.ExpireEvent = genEventMessage(EventDatas.ExpireEvent, "已經結束的活動", "距離結束");
    objEventMsg.ExpireEvent.hero = {
      type: "image",
      url: "https://i.imgur.com/X78dOeL.jpg",
      size: "full",
      aspectMode: "fit",
      aspectRatio: "16:9",
    };
  }

  let sender = {
    name: "公主秘書",
    iconUrl: "https://i.imgur.com/BOzOY40.jpg",
  };

  context.sendFlex(
    "公主活動",
    {
      type: "carousel",
      contents: [objEventMsg.HoldingEvent, objEventMsg.FutureEvent, objEventMsg.ExpireEvent],
    },
    { sender }
  );
};

function genEventMessage(EventData, title = "未設定", thirdTitle = "距離現在") {
  var bubble = JSON.parse(assemble({ title: title }, JSON.stringify(eventTPL)));

  bubble.body.contents = EventData.map(function (data) {
    let mapData = {
      title: data.campaign_name,
      start: data.start_time,
      end: data.end_time,
      thirdTitle: thirdTitle,
      distance: data.distance,
    };

    return JSON.parse(assemble(mapData, JSON.stringify(eventBox)));
  });

  return bubble;
}
