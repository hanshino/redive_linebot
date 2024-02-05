const humanNumber = require("human-number");

exports.generatePanel = ({ chips }) => ({
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "猜大小",
        weight: "bold",
        align: "center",
        size: "lg",
        color: "#009688",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "按下按鈕後，布丁將會骰出三顆最大值為六的骰子，你可以決定要猜哪一個",
            wrap: true,
            size: "sm",
            color: "#666666",
          },
          {
            type: "text",
            text: "● 3~10為小，賠率1",
            size: "sm",
            color: "#666666",
          },
          {
            type: "text",
            text: "● 11~18為大，賠率1",
            size: "sm",
            color: "#666666",
          },
          {
            type: "text",
            text: "● 猜其中兩顆骰子同數字，賠率5",
            size: "sm",
            color: "#666666",
          },
          {
            type: "text",
            text: "● 猜其中三顆骰子同數字，賠率24",
            size: "sm",
            color: "#666666",
          },
        ],
        spacing: "sm",
        paddingAll: "sm",
      },
    ],
    spacing: "md",
    paddingAll: "12px",
  },
  footer: {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      {
        type: "text",
        align: "center",
        size: "xs",
        color: "#FF0000",
        contents: [
          {
            type: "span",
            text: "注意：此面板點擊一次扣除",
          },
          {
            type: "span",
            text: ` ${humanNumber(chips)} `,
            weight: "bold",
            color: "#FF6513",
          },
          {
            type: "span",
            text: "女神石",
          },
        ],
      },
      {
        type: "text",
        align: "center",
        text: "為避免誤觸，目前僅限定自行輸入指令\n#猜 大/小/兩顆/三顆 金額",
        size: "xs",
        color: "#FF0000",
        wrap: true,
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
                text: "大",
                align: "center",
                size: "sm",
                weight: "bold",
                color: "#009688",
              },
            ],
            borderWidth: "2px",
            cornerRadius: "md",
            borderColor: "#009688",
            paddingAll: "md",
            // action: {
            //   type: "postback",
            //   data: JSON.stringify({
            //     action: "sicBoGuess",
            //     option: "big",
            //     chips,
            //   }),
            //   displayText: `#猜 大 ${chips}`,
            // },
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "小",
                align: "center",
                size: "sm",
                weight: "bold",
                color: "#009688",
              },
            ],
            borderWidth: "2px",
            cornerRadius: "md",
            borderColor: "#009688",
            paddingAll: "md",
            // action: {
            //   type: "postback",
            //   data: JSON.stringify({
            //     action: "sicBoGuess",
            //     option: "small",
            //     chips,
            //   }),
            //   displayText: `#猜 小 ${chips}`,
            // },
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "兩顆",
                align: "center",
                size: "sm",
                weight: "bold",
                color: "#009688",
              },
            ],
            borderWidth: "2px",
            cornerRadius: "md",
            borderColor: "#009688",
            paddingAll: "md",
            // action: {
            //   type: "postback",
            //   data: JSON.stringify({
            //     action: "sicBoGuess",
            //     option: "double",
            //     chips,
            //   }),
            //   displayText: `#猜 兩顆 ${chips}`,
            // },
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "三顆",
                align: "center",
                size: "sm",
                weight: "bold",
                color: "#009688",
              },
            ],
            borderWidth: "2px",
            cornerRadius: "md",
            borderColor: "#009688",
            paddingAll: "md",
            // action: {
            //   type: "postback",
            //   data: JSON.stringify({
            //     action: "sicBoGuess",
            //     option: "triple",
            //     chips,
            //   }),
            //   displayText: `#猜 三顆 ${chips}`,
            // },
          },
        ],
        spacing: "sm",
      },
    ],
  },
});
