// Shared palette + flex primitives for the Prestige bubble family
// (Lv50CTA / Lv100CTA / Lv100NoTrialCTA / Status / TrialEnter).

const PRESTIGE_PURPLE = "#3B2A6B";
const PRESTIGE_GOLD = "#F5C84B";
const PRESTIGE_PURPLE_DEEP = "#2A1F4D";
const PRESTIGE_LILAC = "#E5DFFF";
const FALLBACK_AVATAR = "https://i.imgur.com/NMl4z2u.png";
const PRESTIGE_CAP = 5;

function avatarBubble(pictureUrl) {
  return {
    type: "box",
    layout: "vertical",
    width: "36px",
    height: "36px",
    cornerRadius: "18px",
    backgroundColor: PRESTIGE_PURPLE_DEEP,
    borderColor: PRESTIGE_GOLD,
    borderWidth: "1.5px",
    flex: 0,
    contents: [
      {
        type: "image",
        url: pictureUrl || FALLBACK_AVATAR,
        size: "full",
        aspectMode: "cover",
        aspectRatio: "1:1",
      },
    ],
  };
}

function levelBadge(text = "Lv.100") {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: PRESTIGE_PURPLE_DEEP,
    cornerRadius: "10px",
    paddingTop: "3px",
    paddingBottom: "3px",
    paddingStart: "10px",
    paddingEnd: "10px",
    borderColor: PRESTIGE_GOLD,
    borderWidth: "1px",
    flex: 0,
    contents: [
      {
        type: "text",
        text,
        color: PRESTIGE_GOLD,
        size: "xs",
        weight: "bold",
        align: "center",
      },
    ],
  };
}

function bulletRow(num, text) {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: num, color: PRESTIGE_GOLD, size: "sm", weight: "bold", flex: 0 },
      { type: "text", text, color: "#444444", size: "sm", wrap: true },
    ],
  };
}

module.exports = {
  PRESTIGE_PURPLE,
  PRESTIGE_GOLD,
  PRESTIGE_PURPLE_DEEP,
  PRESTIGE_LILAC,
  FALLBACK_AVATAR,
  PRESTIGE_CAP,
  avatarBubble,
  levelBadge,
  bulletRow,
};
