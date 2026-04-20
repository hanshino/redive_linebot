const { SEMANTIC } = require("../../common/theme");
const { buildSubPanel } = require("./_shared");

const AMBER_500 = SEMANTIC.secondary.main;
const AMBER_300 = "#FCD34D";
const TEXT = "#1A2332";
const MUTED = "#5A6B7F";

function accentBar() {
  return {
    type: "box",
    layout: "vertical",
    contents: [],
    height: "4px",
    background: {
      type: "linearGradient",
      angle: "90deg",
      startColor: AMBER_500,
      endColor: AMBER_300,
    },
    backgroundColor: AMBER_500,
  };
}

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
        color: TEXT,
        flex: 1,
      },
      {
        type: "text",
        text: `${count} 張啟用中`,
        size: "xxs",
        color: MUTED,
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
  const contents = [accentBar(), header(panels.length)];
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
