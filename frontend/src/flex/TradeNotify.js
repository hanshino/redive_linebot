import liff from "@line/liff";

/**
 * Single-CTA trade-invitation Flex bubble.
 * @param {Object} args
 * @param {number} args.marketId
 * @param {string} args.name           - character display name
 * @param {string} args.image          - character image url
 * @param {number} args.charge         - god-stone price
 * @param {string} args.sellerName     - seller's LINE display name
 * @param {number} [args.star]         - character rarity
 */
export const genNotify = ({ marketId, name, image, charge, sellerName, star = 0 }) => {
  const safeSellerName = sellerName || "好友";
  const starText = star > 0 ? "★".repeat(star) : "";

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: `👤 ${safeSellerName} 邀請你交易`,
          weight: "bold",
          flex: 5,
          wrap: true,
        },
        {
          type: "text",
          text: `#${marketId}`,
          align: "end",
          color: "#8c8c8c",
          flex: 2,
        },
      ],
      paddingAll: "lg",
      paddingBottom: "sm",
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [
            {
              type: "image",
              url: image,
              size: "full",
              aspectMode: "cover",
              aspectRatio: "1:1",
              flex: 2,
            },
            {
              type: "box",
              layout: "vertical",
              flex: 3,
              spacing: "xs",
              contents: [
                { type: "text", text: name, weight: "bold", size: "md", wrap: true },
                ...(starText
                  ? [{ type: "text", text: starText, size: "sm", color: "#FFB300" }]
                  : []),
              ],
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "md",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "金額", color: "#8c8c8c", size: "sm", flex: 2 },
                {
                  type: "text",
                  text: `💎 ${Number(charge).toLocaleString()}`,
                  size: "sm",
                  weight: "bold",
                  align: "end",
                  flex: 5,
                  color: "#129912",
                },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "限定讓售給", color: "#8c8c8c", size: "sm", flex: 2 },
                {
                  type: "text",
                  text: "你",
                  size: "sm",
                  align: "end",
                  flex: 5,
                  color: "#8c8c8c",
                },
              ],
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          margin: "lg",
          contents: [{ type: "text", text: "查看交易", align: "center", color: "#ffffff" }],
          paddingAll: "md",
          backgroundColor: "#2C5F9B",
          cornerRadius: "md",
          action: {
            type: "uri",
            uri: `https://liff.line.me/${liff.id}/trade/${marketId}`,
          },
        },
      ],
    },
  };
};
