const i18n = require("../../util/i18n");

/**
 * 產出任務資訊
 * @param {Object} param0
 * @param {Boolean} param0.gacha
 * @param {Boolean} param0.janken
 * @param {Number} param0.weeklyCompletedCount
 */
exports.genDailyInfo = ({ gacha, janken, weeklyCompletedCount }) => {
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "任務一覽",
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
        this.genQuestRow({
          type: "daily",
          quest: "gacha",
          quest_count: gacha ? 1 : 0,
          quest_count_max: 1,
        }),
        this.genQuestRow({
          type: "daily",
          quest: "janken",
          quest_count: janken ? 1 : 0,
          quest_count_max: 1,
        }),
        this.genQuestRow({
          type: "weekly",
          quest: "weekly",
          quest_count: weeklyCompletedCount,
          quest_count_max: 7,
        }),
      ],
      spacing: "md",
    },
  };
};

exports.genQuestRow = ({ type, quest, quest_count, quest_count_max }) => {
  let icon;
  switch (type) {
    case "daily":
      icon = genDailyIcon();
      break;
    case "weekly":
      icon = genWeeklyIcon();
      break;
    default:
      icon = {};
  }

  return {
    type: "box",
    layout: "horizontal",
    contents: [
      icon,
      {
        type: "text",
        flex: 8,
        gravity: "center",
        contents: [
          {
            type: "span",
            text: i18n.__(`template.${quest}`),
          },
          {
            type: "span",
            text: " ",
          },
          {
            type: "span",
            text: i18n.__("template.daily_quest_info", {
              quest_count,
              quest_count_max,
            }),
          },
        ],
        margin: "md",
        size: "sm",
      },
    ],
  };
};

const genDailyIcon = () => ({
  type: "box",
  layout: "vertical",
  contents: [
    {
      type: "text",
      text: i18n.__("template.daily_icon"),
      color: "#999999",
      align: "center",
      flex: 1,
      gravity: "center",
    },
  ],
  borderWidth: "medium",
  borderColor: "#00ff00",
  cornerRadius: "xl",
});

const genWeeklyIcon = () => ({
  type: "box",
  layout: "vertical",
  contents: [
    {
      type: "text",
      text: i18n.__("template.weekly_icon"),
      color: "#999999",
      align: "center",
      flex: 1,
      gravity: "center",
    },
  ],
  borderWidth: "medium",
  borderColor: "#ff000066",
  cornerRadius: "xl",
});
