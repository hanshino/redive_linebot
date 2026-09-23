const i18n = require("../../../util/i18n");
const { COLORS, buildAccentBar, buildSubPanel } = require("./_shared");

function countText(panels) {
  const paused = panels.filter(p => p.paused).length;
  return paused
    ? i18n.__("message.subscribe.card_count_with_paused", { total: panels.length, paused })
    : `${panels.length} 張啟用中`;
}

function header(panels) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: "訂閱特權",
        weight: "bold",
        size: "sm",
        color: COLORS.text,
        flex: 1,
      },
      {
        type: "text",
        text: countText(panels),
        size: "xxs",
        color: COLORS.textMuted,
        align: "end",
        gravity: "bottom",
        flex: 0,
      },
    ],
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    paddingBottom: "sm",
    alignItems: "center",
  };
}

exports.build = ({ panels }) => {
  const contents = [
    buildAccentBar({ startColor: COLORS.amber500, endColor: COLORS.amber300 }),
    header(panels),
  ];
  panels.forEach(p => contents.push(buildSubPanel(p)));

  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      contents,
      spacing: "none",
      paddingAll: "none",
    },
  };
};
