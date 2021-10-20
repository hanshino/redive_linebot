const dateformat = require("dateformat");
const i18n = require("../../util/i18n");

exports.generateBoss = ({ id, image, fullHp, currentHp }) => {
  // caclute percentage of hp and round it to 0 decimal places
  const percentage = Math.round((currentHp / fullHp) * 100);

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "image",
              url: image,
              size: "full",
              aspectMode: "cover",
              aspectRatio: "16:9",
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  contents: [],
                  height: "10px",
                  backgroundColor: "#FF1234AB",
                  width: `${percentage}%`,
                },
              ],
              backgroundColor: "#808080",
              cornerRadius: "lg",
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: `${currentHp}`,
                  color: "#808080",
                  size: "xs",
                },
                {
                  type: "text",
                  text: `${percentage}%`,
                  color: "#808080",
                  size: "xs",
                  align: "end",
                },
              ],
            },
          ],
          paddingTop: "10px",
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
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: i18n.__("template.attack"),
                      align: "center",
                    },
                  ],
                  paddingAll: "lg",
                  cornerRadius: "lg",
                  backgroundColor: "#12FF3466",
                  action: {
                    type: "postback",
                    data: JSON.stringify({
                      action: "worldBossAttack",
                      worldBossEventId: id,
                    }),
                  },
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: i18n.__("template.record"),
                      align: "center",
                    },
                  ],
                  paddingAll: "lg",
                  cornerRadius: "lg",
                  backgroundColor: "#12FF3466",
                },
              ],
              spacing: "md",
            },
          ],
          paddingTop: "md",
        },
      ],
      spacing: "md",
    },
  };
};

/**
 * Generate a message for the world boss information
 * @param {Object} param0
 * @param {String} param0.name Name of the world boss
 * @param {String} param0.description Description of the world boss
 * @param {String} param0.announcement Announcement of the world boss
 * @param {Date} param0.start_at Start time of the world boss
 * @param {Date} param0.end_at End time of the world boss
 */
exports.generateBossInformation = ({ name, description, announcement, start_time, end_time }) => {
  start_time = dateformat(start_time, "yyyy-mm-dd");
  end_time = dateformat(end_time, "yyyy-mm-dd");

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          contents: [
            {
              type: "span",
              text: "緊急通報：",
            },
            {
              type: "span",
              text: `${announcement} `,
            },
          ],
          weight: "bold",
          color: "#FF3465AA",
        },
        {
          type: "separator",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: name,
              weight: "bold",
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: description,
                  wrap: true,
                  size: "sm",
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      contents: [
                        {
                          type: "span",
                          text: `${i18n.__("template.level")}: `,
                        },
                        {
                          type: "span",
                          text: "200",
                        },
                      ],
                    },
                    {
                      type: "text",
                      contents: [
                        {
                          type: "span",
                          text: `${i18n.__("template.hp")}: `,
                        },
                        {
                          type: "span",
                          text: "2000000",
                        },
                      ],
                    },
                    {
                      type: "text",
                      contents: [
                        {
                          type: "span",
                          text: `${i18n.__("template.attack")}: `,
                        },
                        {
                          type: "span",
                          text: "200",
                        },
                      ],
                    },
                    {
                      type: "text",
                      contents: [
                        {
                          type: "span",
                          text: `${i18n.__("template.defense")}: `,
                        },
                        {
                          type: "span",
                          text: "200",
                        },
                      ],
                    },
                  ],
                  borderWidth: "normal",
                  borderColor: "#5656FA64",
                  cornerRadius: "md",
                  paddingAll: "md",
                  spacing: "sm",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "活動期間",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: start_time,
                    },
                    {
                      type: "span",
                      text: " ~ ",
                    },
                    {
                      type: "span",
                      text: end_time,
                    },
                  ],
                  size: "xxs",
                  color: "#808080",
                },
              ],
              spacing: "md",
            },
          ],
        },
      ],
      spacing: "md",
    },
  };
};
