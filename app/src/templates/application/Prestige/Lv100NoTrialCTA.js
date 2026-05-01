// LINE Flex bubble for the "you've hit Lv.100 but never passed a trial" reminder.
// Tone: gentle nudge — XP is capped, pick a trial to keep progressing.

const {
  PRESTIGE_PURPLE,
  PRESTIGE_GOLD,
  PRESTIGE_LILAC,
  avatarBubble,
  levelBadge,
  bulletRow,
} = require("./_shared");

function buildBubble({ displayName, pictureUrl, prestigeCount, liffUri }) {
  const subtitle =
    prestigeCount === 0 ? "等級已封頂，但你還沒挑過任何試煉" : "新一輪等級已封頂，請挑選下一個試煉";

  return {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: PRESTIGE_PURPLE,
      paddingAll: "20px",
      paddingTop: "14px",
      paddingBottom: "16px",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "baseline",
          spacing: "xs",
          contents: [
            { type: "text", text: "⏸", size: "xs", flex: 0 },
            {
              type: "text",
              text: `${displayName} 達成 Lv.100`,
              color: PRESTIGE_GOLD,
              size: "xs",
              weight: "bold",
            },
          ],
        },
        {
          type: "text",
          text: "🪧 但是，少了試煉",
          color: PRESTIGE_GOLD,
          size: "xl",
          weight: "bold",
          margin: "xs",
        },
        { type: "text", text: subtitle, color: PRESTIGE_LILAC, size: "xs" },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          margin: "md",
          alignItems: "center",
          contents: [
            avatarBubble(pictureUrl),
            {
              type: "text",
              text: displayName,
              color: "#FFFFFF",
              size: "sm",
              weight: "bold",
              flex: 0,
              gravity: "center",
            },
            levelBadge(),
          ],
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "20px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          backgroundColor: "#FBF1E8",
          cornerRadius: "8px",
          paddingAll: "10px",
          borderWidth: "1px",
          borderColor: "#EBCDA8",
          contents: [
            {
              type: "text",
              text: "⚠️ XP 已封頂，多餘訊息不再累計",
              color: "#7A4A12",
              size: "xs",
              weight: "bold",
              align: "center",
              wrap: true,
            },
          ],
        },
        {
          type: "text",
          text: "為什麼要試煉？",
          color: PRESTIGE_PURPLE,
          size: "md",
          weight: "bold",
          margin: "md",
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            bulletRow("1", "通過任一試煉才能進行轉生"),
            bulletRow("2", "試煉期間 60 天，XP 同時計入等級與進度"),
            bulletRow("3", "選擇試煉後，下次滿等再回來領祝福"),
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      paddingTop: "8px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: PRESTIGE_GOLD,
          height: "sm",
          action: { type: "uri", label: "前往挑選試煉", uri: liffUri },
        },
      ],
    },
    styles: { footer: { backgroundColor: "#FFFFFF" } },
  };
}

/**
 * Build the Lv.100 "no passed trial" reminder flex.
 *
 * @param {Object} input
 * @param {String} input.displayName
 * @param {String} [input.pictureUrl]
 * @param {Number} input.prestigeCount
 * @param {String} input.liffUri
 * @returns {{ altText: String, contents: Object }}
 */
exports.build = ({ displayName, pictureUrl, prestigeCount, liffUri }) => {
  const safeName = displayName || "玩家";
  const safeCount = Number.isInteger(prestigeCount) ? prestigeCount : 0;
  return {
    altText: `${safeName} 已達 Lv.100 但尚未通過任何試煉，請前往 LIFF 挑選試煉`,
    contents: buildBubble({
      displayName: safeName,
      pictureUrl,
      prestigeCount: safeCount,
      liffUri,
    }),
  };
};
