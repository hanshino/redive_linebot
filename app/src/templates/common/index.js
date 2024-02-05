/**
 * 存放通用函式庫
 */
module.exports = {
  assemble: function (mapData, strData) {
    var objMapData = {};

    Object.keys(mapData).forEach(key => {
      let newIndex = "{" + key.toLowerCase() + "}";
      objMapData[newIndex] = mapData[key];
    });

    var re = new RegExp(Object.keys(objMapData).join("|"), "gi");

    var strResult = strData.replace(re, function (matched) {
      matched = matched.toLowerCase();
      return objMapData[matched];
    });

    return strResult;
  },

  /**
   * 取得Liff網址
   * @param {String} type ian, compact, full, tall
   * @param {String} path 路徑
   */
  getLiffUri: function (type, path) {
    let host = "https://liff.line.me/";
    let id = process.env.LINE_LIFF_ID;
    let typeId;
    switch (type.toLowerCase()) {
      case "ian":
        typeId = process.env.LINE_LIFF_IAN_ID;
        break;
      case "compact":
        typeId = process.env.LINE_LIFF_COMPACT_ID;
        break;
      case "full":
        typeId = process.env.LINE_LIFF_FULL_ID;
        break;
      case "tall":
        typeId = process.env.LINE_LIFF_TALL_ID;
        break;
    }

    id = typeId || id;

    const liffurl = `${host}${id}`;
    return path ? `${liffurl}?reactRedirectUri=${path}` : liffurl;
  },

  /**
   * 產出小型的 bubble 按鈕
   * @param {String} title 標題
   * @param {String} url 網址
   * @param {String} color 色碼
   * @param {Object} option 其他參數
   * @param {String} option.textColor 文字顏色
   */
  genLinkBubble: function (title, url, color, option = {}) {
    let defaultColor = {
      red: "#ff123436",
      blue: "#1234ff36",
      green: "#12ff3436",
    };

    // 如果指定的 color 存在色碼，則使用指定的色碼
    color = defaultColor[color] || color;

    const { textColor } = option;

    return {
      type: "bubble",
      size: "nano",
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
                text: title,
                align: "center",
                color: textColor || undefined,
              },
            ],
            paddingTop: "md",
            paddingBottom: "md",
          },
        ],
        backgroundColor: color,
        action: {
          type: "uri",
          label: "action",
          uri: url,
        },
      },
    };
  },

  /**
   * Generates a rule bubble.
   * @param {string[]} rules
   * @param {string} title
   * @returns
   */
  generateRuleBubble: function (rules, title = "") {
    let ruleBoxes = rules.map(rule => generateRuleTextBox(rule));
    return {
      type: "bubble",
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
                text: title || "系統說明",
              },
              {
                type: "box",
                layout: "vertical",
                contents: ruleBoxes,
                spacing: "lg",
                paddingTop: "md",
              },
            ],
          },
        ],
      },
    };
  },
};

/**
 * Generates a rule text box.
 * @param {string} rule - The rule to be displayed in the text box.
 * @returns {object} - The generated rule text box object.
 */
function generateRuleTextBox(rule) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: "-",
        size: "sm",
        flex: 1,
        align: "center",
      },
      {
        type: "text",
        text: `${rule}`,
        wrap: true,
        size: "sm",
        flex: 10,
      },
    ],
  };
}
