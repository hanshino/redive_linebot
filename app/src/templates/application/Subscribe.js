const { get } = require("lodash");
const platte = {
  red: {
    text: "#FFFFFF",
    background: "#B88C9E",
  },
  blue: {
    text: "#FFFFFF",
    background: "#3D52D5",
  },
};

exports.generateEffect = (text, theme) => ({
  type: "text",
  text,
  size: "sm",
  color: get(platte, `${theme}.text`, "#000000"),
});

/**
 * 產出訂閱卡片資訊
 * @param {Object} param0
 * @param {String} param0.title 卡片標題
 * @param {String} param0.image 卡片圖片
 * @param {Array} param0.effects 卡片效果
 */
exports.generateCard = ({ title, image, effects }) => ({
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
            type: "image",
            url: image,
            size: "sm",
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: title,
              },
              ...effects,
            ],
          },
        ],
      },
    ],
    paddingStart: "sm",
    paddingEnd: "sm",
  },
});

/**
 * 產出用戶訂閱資訊
 * @param {Object} param0
 * @param {String} param0.title 卡片標題
 * @param {String} param0.expiredAt 到期時間
 * @param {String} param0.theme 顏色主題
 * @param {Array} param0.effects 卡片效果
 */
exports.generateStatus = ({ title, effects, expiredAt, theme = "red" }) => ({
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: title,
        color: get(platte, `${theme}.text`, "#FFFFFF"),
        weight: "bold",
      },
    ],
    backgroundColor: get(platte, `${theme}.background`, "#000000"),
    paddingBottom: "none",
  },
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: effects,
      },
      {
        type: "text",
        text: `到期日：${expiredAt}`,
        align: "end",
        size: "xxs",
        color: "#0e0047",
        position: "absolute",
        offsetBottom: "md",
        offsetEnd: "lg",
      },
    ],
    backgroundColor: get(platte, `${theme}.background`, "#FFFFFF"),
  },
});
