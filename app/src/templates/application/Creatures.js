const i18n = require("../../util/i18n");
const config = require("config");
const { isEmpty } = require("lodash");

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
exports.generateMainBubble = ({
  image_url: image,
  nickname,
  satiety,
  favorability,
  stamina,
  exp: experience,
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
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: i18n.__("template.experience"),
                  size: "sm",
                  color: "#808080",
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "box",
                      layout: "vertical",
                      contents: [],
                      backgroundColor: "#AAFFAA",
                      width: "5%", // 經驗值 %數 暫時寫死
                    },
                  ],
                  spacing: "sm",
                  height: "5px",
                  backgroundColor: "#808080",
                  cornerRadius: "md",
                  margin: "sm",
                },
                {
                  type: "text",
                  text: `${experience}`,
                  align: "end",
                  size: "xxs",
                  color: "#4588FF",
                },
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

exports.generateFoodBubble = foods => ({
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: i18n.__("template.okashiya"),
      },
      ...foods,
    ],
    spacing: "xxl",
  },
});

/**
 * 產出單一食物的 Box
 * @param {Object} param0
 * @param {String} param0.name
 * @param {String} param0.description
 * @param {String} param0.image_url
 * @param {Array} param0.effects
 * @returns {Object}
 */
exports.generateFoodItemBox = ({ id, name, image_url, description, effects }) => {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: `${image_url}`,
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: i18n.__("template.use"),
                size: "xxs",
                align: "center",
                color: "#F0F0F0",
              },
            ],
            cornerRadius: "md",
            paddingAll: "1px",
            backgroundColor: "#943872",
            margin: "sm",
          },
        ],
        action: {
          type: "postback",
          data: JSON.stringify({
            action: "useFood",
            id,
          }),
          displayText: `${i18n.__("template.use")} ${name}`,
        },
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${name}`,
            size: "sm",
            weight: "bold",
          },
          {
            type: "text",
            text: `${description}`,
            size: "xs",
          },
          {
            type: "text",
            size: "xxs",
            color: "#808080",
            contents: generateFoodItemEffects(effects),
          },
        ],
        flex: 5,
      },
    ],
    spacing: "md",
  };
};

/**
 * 產出食物的效果文字
 * @param {Array<{type: String, value: Number}>} effects
 * @returns {Array<Object>}
 */
function generateFoodItemEffects(effects = []) {
  if (isEmpty(effects)) {
    return [{ type: "span", text: "-" }];
  }

  return effects.map(effect => {
    return {
      type: "span",
      text: `+${effect.value} ${i18n.__(`template.${effect.type}`)}`,
    };
  });
}
