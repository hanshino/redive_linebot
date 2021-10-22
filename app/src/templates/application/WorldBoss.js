const dateformat = require("dateformat");
const i18n = require("../../util/i18n");
const humanNumber = require("human-number");

exports.generateBoss = ({ id, image, fullHp, currentHp, hasCompleted }) => {
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
            },
          ],
          cornerRadius: "md",
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
                      color: hasCompleted ? "#FFFFFF" : "#808080",
                    },
                  ],
                  paddingAll: "lg",
                  cornerRadius: "lg",
                  backgroundColor: hasCompleted ? "#808080AC" : "#12FF3466",
                  ...(!hasCompleted && {
                    action: {
                      type: "postback",
                      data: JSON.stringify({
                        action: "worldBossAttack",
                        worldBossEventId: id,
                      }),
                    },
                  }),
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
exports.generateBossInformation = ({
  name,
  description,
  announcement,
  start_time,
  end_time,
  hasCompleted,
  level,
  hp,
  attack,
  defense,
  speed,
  gold,
  exp,
}) => {
  start_time = dateformat(start_time, "yyyy-mm-dd");
  end_time = dateformat(end_time, "yyyy-mm-dd");

  let bubble = {
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
          size: "sm",
          wrap: true,
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
                          text: `${level}`,
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
                          text: `${hp}`,
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
                          text: `${attack}`,
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
                          text: `${defense}`,
                        },
                      ],
                    },
                    {
                      type: "text",
                      contents: [
                        {
                          type: "span",
                          text: `${i18n.__("template.speed")}: `,
                        },
                        {
                          type: "span",
                          text: `${speed}`,
                        },
                      ],
                    },
                    {
                      type: "text",
                      contents: [
                        {
                          type: "span",
                          text: `${i18n.__("template.exp")}: `,
                        },
                        {
                          type: "span",
                          text: `${exp}`,
                        },
                      ],
                    },
                    {
                      type: "text",
                      contents: [
                        {
                          type: "span",
                          text: `${i18n.__("template.gold")}: `,
                        },
                        {
                          type: "span",
                          text: `${gold}`,
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

  if (hasCompleted) {
    bubble.body.contents = [getMissionCompleteBox(), ...bubble.body.contents];
  }

  return bubble;
};

function getMissionCompleteBox() {
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "image",
        url: "https://cdn.discordapp.com/attachments/725756780214222909/900580496017358858/square09stamplred-vector-id1167967380.png",
        size: "full",
        aspectMode: "fit",
      },
    ],
    position: "absolute",
    offsetTop: "0px",
    offsetStart: "0px",
    width: "300px",
  };
}

exports.generateTopTenRank = rankBoxes => {
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
              type: "text",
              text: `🏆${i18n.__("template.attack_rank")}🥇`,
              align: "center",
              color: "#FF3434",
            },
          ],
          paddingAll: "md",
          paddingTop: "none",
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: "#",
              weight: "bold",
              flex: 1,
              align: "center",
            },
            {
              type: "text",
              text: i18n.__("template.nickname"),
              weight: "bold",
              flex: 6,
            },
            {
              type: "text",
              text: i18n.__("template.damage"),
              weight: "bold",
              flex: 4,
            },
          ],
        },
        {
          type: "separator",
          margin: "sm",
        },
        ...rankBoxes,
      ],
    },
  };
};

/**
 * @param {Object} param0
 * @param {String} param0.name
 * @param {Number} param0.damage
 * @param {Number|String} param0.rank
 */
exports.generateRankBox = ({ rank, name, damage }) => {
  let specialIcons = ["🥇", "🥈", "🥉"];
  let box = {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: `${rank}`,
        flex: 1,
        size: "sm",
        align: "center",
      },
      {
        type: "text",
        text: name,
        flex: 6,
        size: "sm",
      },
      {
        type: "text",
        text: `${humanNumber(damage, n => Number.parseFloat(n).toFixed(1))}`,
        flex: 4,
        size: "sm",
      },
    ],
    margin: "sm",
    paddingAll: "xs",
  };

  // 如果為前三名，就加上特殊icon
  if (rank <= 3) {
    box.contents[0].text = specialIcons[rank - 1];
  }

  // 如果排名為問號，將文字顏色設為灰色
  if (rank === "?") {
    box.contents[1].color = "#808080";
    box.contents[2].color = "#808080";
  }

  return box;
};
