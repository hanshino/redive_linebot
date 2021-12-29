const config = require("config");

exports.generateJanken = ({ p1IconUrl, p2IconUrl, p1Uid, p2Uid, uuid, title = "" }) => {
  const genAction = function (type) {
    return {
      type: "postback",
      label: type,
      data: JSON.stringify({
        action: "janken",
        type,
        uuid,
        userId: p1Uid,
        targetUserId: p2Uid,
      }),
    };
  };
  let bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "image",
                  url: p1IconUrl,
                },
              ],
              cornerRadius: "45px",
            },
            {
              type: "image",
              url: "https://i.imgur.com/JMR1TMN.jpg",
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "image",
                  url: p2IconUrl,
                },
              ],
              cornerRadius: "45px",
            },
          ],
          spacing: "md",
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
                  text: config.get("minigame.janken.scissors"),
                  size: "4xl",
                  align: "center",
                },
              ],
              paddingAll: "md",
              backgroundColor: "#80808034",
              cornerRadius: "lg",
              flex: 1,
              action: genAction("scissors"),
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: config.get("minigame.janken.rock"),
                  size: "4xl",
                  align: "center",
                },
              ],
              paddingAll: "md",
              backgroundColor: "#80808034",
              cornerRadius: "lg",
              flex: 1,
              action: genAction("rock"),
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: config.get("minigame.janken.paper"),
                  size: "4xl",
                  align: "center",
                },
              ],
              paddingAll: "md",
              backgroundColor: "#80808034",
              cornerRadius: "lg",
              flex: 1,
              action: genAction("paper"),
            },
          ],
          paddingTop: "lg",
          spacing: "md",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              align: "center",
              text: "交給命運",
            },
          ],
          paddingAll: "lg",
          margin: "md",
          cornerRadius: "md",
          backgroundColor: "#80808034",
          action: genAction("random"),
        },
      ],
    },
  };

  if (title) {
    bubble.body.contents.unshift({
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: `${title}`,
          align: "center",
          weight: "bold",
        },
      ],
      paddingAll: "lg",
    });
  }

  return bubble;
};

exports.generateJankenGrade = ({ winCount = 0, loseCount = 0, drawCount = 0, rate = 0 }) => {
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "猜拳戰績",
          align: "center",
          weight: "bold",
        },
      ],
      paddingBottom: "none",
    },
    body: {
      type: "box",
      layout: "vertical",
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
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: `${winCount}`,
                    },
                    {
                      type: "span",
                      text: "勝",
                    },
                  ],
                  align: "center",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: `${loseCount}`,
                    },
                    {
                      type: "span",
                      text: "敗",
                    },
                  ],
                  align: "center",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: `${drawCount}`,
                    },
                    {
                      type: "span",
                      text: "平手",
                    },
                  ],
                  align: "center",
                },
              ],
              spacing: "sm",
            },
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: "勝率",
                },
                {
                  type: "span",
                  text: "：",
                },
                {
                  type: "span",
                  text: `${rate}%`,
                },
              ],
              align: "center",
            },
          ],
          paddingAll: "sm",
          spacing: "md",
        },
      ],
    },
  };
};
