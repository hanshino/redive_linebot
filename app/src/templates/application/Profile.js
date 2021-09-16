const i18n = require("../../util/i18n");
/**
 * 產出其他資訊小卡的畫面
 * @param {Object} param
 * @param {Object} param.bindInfo
 * @param {String} param.bindInfo.uid
 * @param {Number} param.bindInfo.server
 * @param {Array<Object>} param.subInfo
 */
exports.genOtherInformations = ({ bindInfo, subInfo }) => {
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "其他資訊",
          align: "center",
          weight: "bold",
        },
      ],
      paddingBottom: "0px",
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
              text: "綁定資訊",
              size: "sm",
              weight: "bold",
            },
            genBindComponent(bindInfo),
          ],
          paddingAll: "sm",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "訂閱通知",
              size: "sm",
              weight: "bold",
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                ...subInfo.map(info => {
                  console.log(info);
                  return genSubComponent(info.status === 1, info.title);
                }),
              ],
            },
          ],
          paddingAll: "sm",
        },
      ],
    },
  };
};

function genBindComponent({ uid = null, server = null }) {
  let result = {
    type: "text",
    contents: [
      {
        type: "span",
        text: "未綁定",
        color: "#FF1542",
      },
      {
        type: "span",
        text: " ",
      },
      {
        type: "span",
        text: " ",
      },
    ],
    size: "sm",
  };

  if (uid) {
    result.contents[0].color = "#AC65FF";
    result.contents[0].text = "綁定中";
    result.contents[2].text = new Intl.NumberFormat("en").format(parseInt(uid));
  }

  if (server) {
    result.contents.push({ type: "span", text: " " });
    result.contents.push({ type: "span", text: i18n.__("server." + server) });
  }

  return result;
}

function genSubComponent(status = false, text) {
  let icon = status ? "✔️" : "❌";
  return {
    type: "text",
    contents: [
      {
        type: "span",
        text: icon,
      },
      {
        type: "span",
        text: " ",
      },
      {
        type: "span",
        text: text,
      },
    ],
    size: "xs",
  };
}
