const format = require("date-format");
const { padStart } = require("lodash");
const i18n = require("../../util/i18n");
const moment = require("moment");

exports.generateBoardCarryOverBox = (carryOver = 0) => {
  const chunk = carryOver.toString().split("");
  const boxes = chunk.map(generateCarryOverNumBox);

  return {
    type: "box",
    layout: "horizontal",
    contents: [
      ...boxes,
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "元",
            align: "center",
          },
        ],
        maxWidth: "30px",
      },
    ],
    spacing: "md",
    margin: "sm",
    justifyContent: "center",
    alignItems: "center",
  };
};

function generateCarryOverNumBox(strNum = "0") {
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: strNum,
        align: "center",
      },
    ],
    borderWidth: "light",
    borderColor: "#000000",
    maxWidth: "30px",
    cornerRadius: "md",
  };
}

exports.generateBoardResultBox = (result = []) => {
  if (result.length === 0) {
    result = Array.from({ length: 5 }, () => "?");
  }
  const boxes = result.map(generateResultNumBox);

  return {
    type: "box",
    layout: "horizontal",
    contents: boxes,
    spacing: "md",
    margin: "sm",
    justifyContent: "center",
  };
};

function generateResultNumBox(strNum = "?") {
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: strNum,
        align: "center",
        color: "#f2a44e",
      },
    ],
    borderWidth: "light",
    borderColor: "#000000",
    maxWidth: "30px",
    cornerRadius: "sm",
  };
}

exports.generateBoardBubble = ({ id, result, carryOver, status, created_at }) => {
  const resultBox = this.generateBoardResultBox(result);
  const carryOverBox = this.generateBoardCarryOverBox(carryOver);
  const createdAt = moment(created_at).toDate();
  const textStatus =
    status === "selling" ? i18n.__("template.not_yet_draw") : i18n.__("template.already_drawed");

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "布丁大樂透",
          color: "#FFFFFF",
        },
        {
          type: "text",
          size: "xxs",
          color: "#fa8e90",
          align: "end",
          contents: [
            {
              type: "span",
              text: "第",
            },
            {
              type: "span",
              text: " ",
            },
            {
              type: "span",
              text: `${format("yyyyMMdd", createdAt)}${padStart(id, 3, "0")}`,
            },
            {
              type: "span",
              text: " ",
            },
            {
              type: "span",
              text: "期",
            },
          ],
        },
      ],
      backgroundColor: "#c4090d",
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
              type: "text",
              text: textStatus,
              align: "center",
              color: "#c86f0d",
            },
            resultBox,
          ],
        },
        {
          type: "separator",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: i18n.__("template.lottery_carry_over"),
              weight: "bold",
              color: "#eed052",
              align: "center",
            },
            carryOverBox,
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
                  text: i18n.__("template.lottery_manual_buy"),
                  align: "center",
                  size: "sm",
                },
              ],
              paddingAll: "md",
              cornerRadius: "md",
              backgroundColor: "#f6e59e",
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: i18n.__("template.lottery_auto_buy"),
                  align: "center",
                  size: "sm",
                },
              ],
              paddingAll: "md",
              cornerRadius: "md",
              backgroundColor: "#f6bd7e",
              action: {
                type: "postback",
                data: JSON.stringify({
                  action: "lottery_auto_buy",
                  cooldown: 30,
                }),
              },
            },
          ],
          spacing: "md",
          paddingTop: "md",
        },
      ],
      spacing: "sm",
    },
  };
};

exports.generateTicketBubble = ({ id, total, rows, created_at }) => {
  const createdAt = moment(created_at).toDate();
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "布丁大樂透",
          color: "#FFFFFF",
        },
        {
          type: "text",
          size: "xxs",
          color: "#fa8e90",
          align: "end",
          contents: [
            {
              type: "span",
              text: "第",
            },
            {
              type: "span",
              text: " ",
            },
            {
              type: "span",
              text: `${format("yyyyMMdd", createdAt)}${padStart(id, 3, "0")}`,
            },
            {
              type: "span",
              text: " ",
            },
            {
              type: "span",
              text: "期",
            },
          ],
        },
      ],
      backgroundColor: "#c4090d",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "separator",
          color: "#808080",
        },
        {
          type: "box",
          layout: "vertical",
          contents: rows,
        },
        {
          type: "separator",
          color: "#808080",
        },
        {
          type: "text",
          contents: [
            {
              type: "span",
              text: "總金額：",
            },
            {
              type: "span",
              text: `${total}`,
            },
          ],
          size: "sm",
          align: "center",
        },
      ],
      spacing: "md",
      backgroundColor: "#fa8e8f45",
    },
  };
};

exports.generateTicketRow = ({ idx, numbers, buyType, perPrice }) => {
  const numberBoxes = numbers.map(number => ({
    type: "text",
    text: padStart(number, 2, "0"),
    size: "xxs",
    flex: 1,
  }));
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: `${idx})`,
        size: "xxs",
        flex: 1,
      },
      ...numberBoxes,
      {
        type: "text",
        size: "xxs",
        flex: 2,
        contents: [
          {
            type: "span",
            text: `${buyType}`,
          },
          {
            type: "span",
            text: ` ${perPrice}`,
          },
        ],
      },
    ],
  };
};
