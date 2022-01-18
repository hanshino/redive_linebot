exports.generateRowBox = ({ icon, name, colorCode = "#80808099" }) => {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
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
            text: name,
          },
        ],
        align: "center",
        size: "sm",
        wrap: true,
      },
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
