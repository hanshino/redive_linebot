const imageRegex = /^(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif))$/;

exports.generateRowBox = ({ icon, name, colorCode = "#80808099" }) => {
  let iconBox;

  if (imageRegex.test(icon)) {
    iconBox = {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "image",
          url: icon,
          flex: 4,
          size: "full",
          aspectMode: "cover",
        },
      ],
      cornerRadius: "60px",
      width: "35px",
      height: "35px",
      margin: "sm",
    };
  } else {
    iconBox = {
      type: "text",
      text: icon,
      align: "center",
      gravity: "center",
      flex: 2,
    };
  }

  const filler = { type: "filler", flex: 1 };

  return {
    type: "box",
    layout: "horizontal",
    contents: [
      filler,
      iconBox,
      {
        type: "text",
        contents: [],
        size: "sm",
        wrap: true,
        text: name,
        align: "center",
        gravity: "center",
        flex: 8,
      },
      filler,
    ],
    backgroundColor: colorCode,
    paddingAll: "sm",
    cornerRadius: "md",
  };
};

/**
 * 產出成就清單
 * @param {Array} rows 最多10個比較不會太長
 */
exports.generateBubble = rows => {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: rows,
      spacing: "md",
    },
  };
};

/**
 * 產生規則 bubble
 * @param {Array} rules
 * @returns {Object}
 */
exports.generateRuleBubble = rules => {
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
              text: "系統說明",
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
};

/**
 * 產生狀態 bubble 用的 成就列表
 * @param {Array<String>} icons
 */
exports.generateStatusBox = icons => {
  let contents = [];

  icons.forEach(icon => {
    contents.push(
      {
        type: "span",
        text: `${icon}`,
        size: "lg",
      },
      {
        type: "span",
        text: " ",
      }
    );
  });

  return {
    type: "box",
    layout: "vertical",
    paddingTop: "md",
    contents: [
      {
        type: "text",
        contents,
        wrap: true,
      },
    ],
  };
};

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
