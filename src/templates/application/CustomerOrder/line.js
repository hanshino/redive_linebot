const delTPL = {
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    spacing: "md",
    contents: [
      {
        type: "text",
        text: "1",
        contents: [
          { type: "span", text: "關鍵字指令 ", size: "xs", color: "#8b0000" },
          { type: "span", text: "全符合型指令", size: "xs", color: "#000000" },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "回覆", weight: "bold", flex: 5 },
          { type: "text", text: "點擊刪除", weight: "bold", flex: 2 },
        ],
      },
    ],
  },
};
const insertManualTPL = {
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    contents: [{ type: "text", text: "新增指令教學說明", size: "lg", align: "center" }],
  },
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      { type: "text", text: "#新增指令 A B", align: "center" },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "A", flex: 2, align: "center" },
          { type: "text", text: "觸發指令關鍵字", flex: 3 },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "B", flex: 2, align: "center" },
          { type: "text", text: "觸發後回應訊息", flex: 3 },
        ],
      },
      { type: "separator" },
      { type: "text", text: "規則說明", align: "center", size: "lg" },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "1.", size: "xs", flex: 1 },
          {
            type: "text",
            text: "指令會綁定群組，不用擔心大家會看到",
            flex: 9,
            size: "xs",
            wrap: true,
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "2.", size: "xs", flex: 1 },
          {
            type: "text",
            text: "新增一樣的指令，將會隨機抽取回覆！",
            flex: 9,
            size: "xs",
            wrap: true,
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "3.", size: "xs", flex: 1 },
          {
            type: "text",
            text: "指令與布丁功能重複，優先取布丁功能～",
            flex: 9,
            size: "xs",
            wrap: true,
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "4.", size: "xs", flex: 1 },
          {
            type: "text",
            text: "回應訊息可使用照片或文字，照片請附上圖片網址",
            flex: 9,
            wrap: true,
            size: "xs",
          },
        ],
        margin: "lg",
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "5.", size: "xs", flex: 1 },
          {
            type: "text",
            text: "圖片網址需為https://開頭，只接受jpg,jpeg,png圖檔",
            flex: 9,
            wrap: true,
            size: "xs",
          },
        ],
        margin: "lg",
      },
    ],
    spacing: "md",
  },
};
const deleteManualTPL = {
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    contents: [{ type: "text", text: "移除指令教學說明", size: "lg", align: "center" }],
  },
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      { type: "text", text: "#移除指令 A", align: "center" },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "A", flex: 2, align: "center" },
          { type: "text", text: "觸發指令關鍵字", flex: 3 },
        ],
        margin: "lg",
      },
      { type: "separator" },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "1.", flex: 1, gravity: "center", size: "sm" },
              { type: "text", text: "刪除後暫存3天", flex: 9, wrap: true, size: "sm" },
            ],
            margin: "lg",
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "2.", flex: 1, gravity: "center", size: "sm" },
              {
                type: "text",
                text: "承上，可使用 #指令列表 回復",
                flex: 9,
                wrap: true,
                size: "sm",
              },
            ],
            margin: "lg",
          },
        ],
      },
    ],
    spacing: "md",
  },
};
const liffUri = `https://liff.line.me/${process.env.LINE_LIFF_ID}`;

exports.showInsertManual = context => {
  let curr = new Date().getTime();
  let sentCoolDown = context.state.sentCoolDown;

  if (sentCoolDown.CusInsert === undefined) {
    context.setState({
      sentCoolDown: {
        ...sentCoolDown,
        CusInsert: curr,
      },
    });

    context.sendFlex("新增指令說明", insertManualTPL);
    return;
  }

  // 1分鐘只能發一次新增指令說明
  if (curr - sentCoolDown.CusInsert > 60 * 1000) {
    context.sendFlex("新增指令說明", insertManualTPL);
    context.setState({
      sentCoolDown: {
        ...sentCoolDown,
        CusInsert: curr,
      },
    });
  } else if (context.event.source.type !== "user") {
    context.sendText("剛剛才發送此訊息，我才不想洗版..");
  }
};

exports.showDeleteManual = context => {
  let curr = new Date().getTime();
  let sentCoolDown = context.state.sentCoolDown;

  if (sentCoolDown.CusDelete === undefined) {
    context.setState({
      sentCoolDown: {
        ...sentCoolDown,
        CusDelete: curr,
      },
    });

    context.sendFlex("刪除指令說明", deleteManualTPL);
    return;
  }

  // 1分鐘只能發一次說明
  if (curr - sentCoolDown.CusDelete > 60 * 1000) {
    context.sendFlex("刪除指令說明", deleteManualTPL);
    context.setState({
      sentCoolDown: {
        ...sentCoolDown,
        CusDelete: curr,
      },
    });
  } else if (context.event.source.type !== "user") {
    context.sendText("剛剛才發送此訊息，我才不想洗版..");
  }
};

function dOrderPacking(deleteOrders) {
  let result = {};

  deleteOrders.forEach(data => {
    result[data.orderKey] = result[data.orderKey] || {
      cusOrder: data.cusOrder,
      touchType: data.touchType,
      replys: [],
    };

    result[data.orderKey].replys.push({ type: data.messageType, reply: data.reply });
  });

  return result;
}

exports.showDeleteOption = (context, deleteOrders) => {
  var bubbleMessage = JSON.parse(JSON.stringify(delTPL));

  var deletePack = dOrderPacking(deleteOrders);

  Object.keys(deletePack).forEach(key => {
    let data = deletePack[key];
    let box = {
      type: "box",
      layout: "horizontal",
      contents: [],
    };
    let reply;

    reply = data.replys.map(replyData => replyData.reply.substr(0, 10)).join(",");

    let orderBox = {
      type: "text",
      text: reply.substr(0, 20),
      flex: 4,
    };

    if (data.touchType == "2") {
      orderBox.color = "#8b0000";
    }

    box.contents.push(orderBox);

    box.contents.push({
      type: "text",
      text: "刪除",
      action: {
        type: "message",
        text: `#刪除指令 ${data.cusOrder} ${key}`,
      },
      flex: 1,
    });

    bubbleMessage.body.contents.push(box);
  });

  context.sendFlex("刪除指令列表", bubbleMessage);
};

exports.showOrderManager = context => {
  let sourceId = context.event.source[`${context.event.source.type}Id`];
  let bubble = {
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
            uri: `${liffUri}/Source/${sourceId}/Customer/Orders`,
          },
        },
      ],
      backgroundColor: "#555555",
    },
  };

  context.sendFlex("指令管理", bubble);
};
