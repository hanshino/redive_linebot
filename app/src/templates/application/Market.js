exports.generateTransferOrderBubble = ({
  sourceName,
  targetName,
  amount,
  sourceId,
  targetId,
  transferId,
}) => ({
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "從",
            color: "#ffffff66",
            size: "sm",
          },
          {
            type: "text",
            text: `${sourceName}`,
            color: "#ffffff",
            size: "xl",
            flex: 4,
            weight: "bold",
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "到",
            color: "#ffffff66",
            size: "sm",
          },
          {
            type: "text",
            text: `${targetName}`,
            color: "#ffffff",
            size: "xl",
            flex: 4,
            weight: "bold",
          },
        ],
      },
    ],
    paddingAll: "20px",
    backgroundColor: "#0367D3",
    spacing: "md",
    height: "154px",
    paddingTop: "22px",
  },
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        color: "#b7b7b7",
        size: "xs",
        contents: [
          {
            type: "span",
            text: "金額：",
          },
          {
            type: "span",
            text: `${amount}`,
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
                type: "filler",
              },
              {
                type: "box",
                layout: "vertical",
                contents: [],
                cornerRadius: "30px",
                height: "12px",
                width: "12px",
                borderColor: "#45EF4D",
                borderWidth: "2px",
              },
              {
                type: "filler",
              },
            ],
            flex: 0,
          },
          {
            type: "text",
            gravity: "center",
            flex: 4,
            size: "sm",
            text: `${sourceName}`,
          },
        ],
        spacing: "lg",
        cornerRadius: "30px",
        margin: "xl",
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
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "filler",
                  },
                  {
                    type: "box",
                    layout: "vertical",
                    contents: [],
                    width: "2px",
                    backgroundColor: "#B7B7B7",
                  },
                  {
                    type: "filler",
                  },
                ],
                flex: 1,
              },
            ],
            width: "12px",
          },
          {
            type: "text",
            text: "連線建立...",
            gravity: "center",
            flex: 4,
            size: "xs",
            color: "#8c8c8c",
          },
        ],
        spacing: "lg",
        height: "64px",
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
                type: "filler",
              },
              {
                type: "box",
                layout: "vertical",
                contents: [],
                cornerRadius: "30px",
                width: "12px",
                height: "12px",
                borderWidth: "2px",
                borderColor: "#6486E3",
              },
              {
                type: "filler",
              },
            ],
            flex: 0,
          },
          {
            type: "text",
            text: `${targetName}`,
            gravity: "center",
            flex: 4,
            size: "sm",
          },
        ],
        spacing: "lg",
        cornerRadius: "30px",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "確定",
            align: "center",
            color: "#ffffff",
          },
        ],
        paddingAll: "md",
        cornerRadius: "md",
        backgroundColor: "#40587C",
        margin: "md",
        action: {
          type: "postback",
          data: JSON.stringify({
            action: "confirmTransfer",
            sourceId,
            targetId,
            transferId,
          }),
        },
      },
    ],
  },
});
