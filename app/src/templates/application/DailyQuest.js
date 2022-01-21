const i18n = require("../../util/i18n");

exports.genDailyInfo = ({ isSignin, isJanken }) => {
  const [checked, unchecked] = [i18n.__("template.checked"), i18n.__("template.unchecked")];
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "每日任務",
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
              type: "text",
              contents: [
                {
                  type: "span",
                  text: "每日一抽",
                },
                {
                  type: "span",
                  text: " ",
                },
                {
                  type: "span",
                  text: isSignin ? checked : unchecked,
                },
              ],
              size: "sm",
            },
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: "每日猜拳",
                },
                {
                  type: "span",
                  text: " ",
                },
                {
                  type: "span",
                  text: isJanken ? checked : unchecked,
                },
              ],
              size: "sm",
            },
          ],
          spacing: "md",
        },
      ],
    },
  };
};
