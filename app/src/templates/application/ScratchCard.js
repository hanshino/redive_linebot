exports.generateScratchCard = ({ title, maxPrize, price, image, link }) => {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "image",
          url: image,
          size: "full",
          aspectMode: "cover",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: title,
                  weight: "bold",
                  color: "#FFFFFF",
                },
                {
                  type: "text",
                  text: `${price}$`,
                  align: "end",
                  color: "#FFFFFF",
                },
              ],
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: `最高獎金 ${maxPrize}$`,
                  color: "#FFFFFF",
                },
              ],
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "前往購買",
                  color: "#FFFFFF",
                  align: "center",
                },
              ],
              paddingAll: "lg",
              borderWidth: "normal",
              borderColor: "#FFFFFF",
              cornerRadius: "md",
              margin: "md",
            },
          ],
          paddingAll: "xl",
          backgroundColor: "#808080AC",
          position: "absolute",
          width: "100%",
          offsetBottom: "none",
        },
      ],
      paddingAll: "none",
    },
  };
};
