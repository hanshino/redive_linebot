const { COLORS, buildAccentBar, buildSubPanel } = require("./_shared");

function header(count) {
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
        text: `${count} 張啟用中`,
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
    header(panels.length),
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
