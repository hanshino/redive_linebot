const i18n = require("../../util/i18n");
const config = require("config");

/**
 * 產出創角色用的 bubble
 */
exports.generateCreateBubble = ({
  id,
  name = " ",
  description = " ",
  image_url,
  max_level = 0,
  max_favorability = 0,
  max_stamina = 0,
  max_satiety = 0,
}) => {
  return {
    type: "bubble",
    hero: {
      type: "image",
      url: image_url,
      size: "full",
      aspectRatio: "16:9",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: `${name}`,
          weight: "bold",
        },
        {
          type: "text",
          text: `${description}`,
          size: "xs",
          wrap: true,
          color: "#808080",
        },

        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: [
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: i18n.__("template.max_level"),
                },
                {
                  type: "span",
                  text: "：",
                },
                {
                  type: "span",
                  text: `${max_level}`,
                },
              ],
              size: "sm",
            },
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: i18n.__("template.max_favorability"),
                },
                {
                  type: "span",
                  text: "：",
                },
                {
                  type: "span",
                  text: `${max_favorability}`,
                },
              ],
              size: "sm",
            },
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: i18n.__("template.max_stamina"),
                },
                {
                  type: "span",
                  text: "：",
                },
                {
                  type: "span",
                  text: `${max_stamina}`,
                },
              ],
              size: "sm",
            },
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: i18n.__("template.max_satiety"),
                },
                {
                  type: "span",
                  text: "：",
                },
                {
                  type: "span",
                  text: `${max_satiety}`,
                },
              ],
              size: "sm",
            },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "選擇",
              align: "center",
            },
          ],
          paddingAll: "md",
          cornerRadius: "lg",
          backgroundColor: "#12AA1266",
        },
      ],
      action: {
        type: "postback",
        label: "選擇",
        data: JSON.stringify({
          action: "initCreatureCreate",
          creature_id: id,
        }),
      },
    },
  };
};

/**
 * 產出角色主畫面用的 bubble
 */
exports.generateCreatureMainBubble = ({
  image_url: image,
  nickname,
  satiety,
  favorability,
  stamina,
}) => {
  return {
    type: "bubble",
    hero: {
      type: "image",
      url: `${image}`,
      size: "full",
      aspectRatio: "16:9",
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
              text: `${nickname}`,
              weight: "bold",
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: i18n.__("template.satiety"),
                  size: "sm",
                  color: "#808080",
                },
                generateIconBaseline({
                  url: config.get("creature.picture.satiety"),
                  number: satiety,
                }),
              ],
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: i18n.__("template.favorability"),
                  size: "sm",
                  color: "#808080",
                },
                generateIconBaseline({
                  url: config.get("creature.picture.favorability"),
                  number: favorability,
                }),
              ],
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: i18n.__("template.stamina"),
                  size: "sm",
                  color: "#808080",
                },
                generateIconBaseline({
                  url: config.get("creature.picture.stamina"),
                  number: stamina,
                }),
              ],
            },
          ],
          spacing: "xs",
        },
      ],
    },
  };
};

function generateIconBaseline({ url, number }) {
  return {
    type: "box",
    layout: "baseline",
    contents: Array.from({ length: number }).map(() => ({
      type: "icon",
      url: url,
    })),
    spacing: "sm",
  };
}
