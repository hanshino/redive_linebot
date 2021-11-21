const dateformat = require("dateformat");
const i18n = require("../../util/i18n");
const humanNumber = require("human-number");

exports.generateBoss = ({
  id,
  image,
  fullHp,
  currentHp,
  hasCompleted = false,
  canAttack = true,
}) => {
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
                  action: {
                    type: "postback",
                    data: JSON.stringify({
                      action: "adminBossAttack",
                      worldBossEventId: id,
                      percentage: 10,
                    }),
                  },
                },
                {
                  type: "text",
                  text: `${percentage}%`,
                  color: "#808080",
                  size: "xs",
                  align: "end",
                  action: {
                    type: "postback",
                    data: JSON.stringify({
                      action: "adminBossAttack",
                      worldBossEventId: id,
                      percentage: 20,
                    }),
                  },
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
                  // 如果已完成或是沒有攻擊權限，就設為灰色
                  backgroundColor: hasCompleted || !canAttack ? "#808080AC" : "#12FF3466",
                  ...(!hasCompleted &&
                    canAttack && {
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

exports.generateOshirase = () => {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "重要告知",
          weight: "bold",
          color: "#FF1212",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "如果你看到此訊息\n代表此群組受到一些限制，目前：",
              wrap: true,
              size: "sm",
            },
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: "● ",
                },
                {
                  type: "span",
                  text: "只有經過特別申請的群組可以遊玩",
                },
              ],
              size: "xs",
            },
            {
              type: "text",
              text: "如此做的目的是為了保持群組的秩序",
              size: "xs",
              align: "center",
              color: "#123456",
              weight: "bold",
            },
          ],
          spacing: "sm",
          paddingTop: "sm",
          paddingBottom: "sm",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "為此，我們建立了一個公用群組，提供無限制的遊玩空間，提供了：",
              size: "sm",
              wrap: true,
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
                      text: "● ",
                    },
                    {
                      type: "span",
                      text: "任何時間隨意的使用布丁功能",
                    },
                  ],
                  size: "xs",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "● ",
                    },
                    {
                      type: "span",
                      text: "管理員駐點，可以隨時提出使用疑問",
                    },
                  ],
                  size: "xs",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "● ",
                    },
                    {
                      type: "span",
                      text: "提供最新消息（如果沒被洗掉的話）",
                    },
                  ],
                  size: "xs",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "● ",
                    },
                    {
                      type: "span",
                      text: "會有更詳細的戰鬥紀錄",
                    },
                  ],
                  size: "xs",
                },
              ],
              paddingAll: "md",
              spacing: "sm",
            },
          ],
          spacing: "sm",
          paddingTop: "md",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "加入專用群組",
              align: "center",
              color: "#C6FF34",
            },
          ],
          backgroundColor: "#1234FF56",
          paddingAll: "md",
          cornerRadius: "md",
          action: {
            type: "uri",
            label: "加入專用群組",
            uri: "http://line.me/ti/g/Yu-Jmbxf1P",
          },
        },
      ],
    },
  };
};

/**
 * 產出冒險者卡片
 * @param {Object} param0
 * @param {String} param0.name 冒險者名稱
 * @param {String} param0.image 冒險者圖片
 * @param {String} param0.level 冒險者等級
 * @param {String} param0.exp 冒險者經驗值
 * @param {String} param0.expPercentage 冒險者經驗值 % 數值
 */
exports.generateAdventureCard = ({ name, image, level, exp, expPercentage }) => {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "image",
          url: "https://i.imgur.com/FD0TWBR.png",
          aspectMode: "cover",
          size: "full",
          aspectRatio: "15:9",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "image",
              url: `${image}`,
              size: "full",
            },
          ],
          borderWidth: "none",
          width: "30%",
          position: "absolute",
          offsetEnd: "10%",
          offsetTop: "15%",
          cornerRadius: "100px",
          paddingAll: "none",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              size: "sm",
              contents: [
                {
                  type: "span",
                  text: "職稱：",
                },
                {
                  type: "span",
                  text: "冒險者",
                },
              ],
            },
            {
              type: "text",
              size: "sm",
              contents: [
                {
                  type: "span",
                  text: "姓名：",
                },
                {
                  type: "span",
                  text: `${name}`,
                },
              ],
            },
            {
              type: "text",
              size: "sm",
              contents: [
                {
                  type: "span",
                  text: "等級：",
                },
                {
                  type: "span",
                  text: `${level}`,
                },
              ],
            },
            {
              type: "text",
              size: "sm",
              contents: [
                {
                  type: "span",
                  text: "經驗：",
                },
                {
                  type: "span",
                  text: `${exp}`,
                },
              ],
            },
          ],
          position: "absolute",
          offsetStart: "7%",
          offsetTop: "15%",
          paddingAll: "md",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "vertical",
              contents: [],
              height: "8px",
              backgroundColor: "#56DE58",
              width: `${expPercentage}%`,
            },
          ],
          backgroundColor: "#9FD8E3CF",
        },
      ],
      paddingAll: "none",
    },
  };
};
