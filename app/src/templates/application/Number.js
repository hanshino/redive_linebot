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
            text: "● 猜其中兩顆骰子同數字，賠率8",
            size: "sm",
            color: "#666666",
          },
          {
            type: "text",
            text: "● 猜其中三顆骰子同數字，賠率180",
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
        size: "sm",
        color: "#FF0000",
        contents: [
          {
            type: "span",
            text: "注意：此面板點擊一次扣除",
          },
          {
            type: "span",
            text: ` ${chips} `,
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
            action: {
              type: "postback",
              data: JSON.stringify({
                action: "sicBoGuess",
                option: "big",
                chips,
              }),
            },
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
            action: {
              type: "postback",
              data: JSON.stringify({
                action: "sicBoGuess",
                option: "small",
                chips,
              }),
            },
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
            action: {
              type: "postback",
              data: JSON.stringify({
                action: "sicBoGuess",
                option: "double",
                chips,
              }),
            },
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
            action: {
              type: "postback",
              data: JSON.stringify({
                action: "sicBoGuess",
                option: "triple",
                chips,
              }),
            },
          },
        ],
        spacing: "sm",
      },
    ],
  },
});
