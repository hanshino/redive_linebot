const format = require("date-format");
const i18n = require("../../util/i18n");
const humanNumber = require("human-number");
const config = require("config");
const RPGCharacter = require("../../model/application/RPGCharacter");
const { getLiffUri } = require("../common");

const makeAttackPayload = (worldBossEventId, jobKey, skill) => ({
  action: "worldBossAttack",
  worldBossEventId,
  attackType: [jobKey, skill].join("|"),
});

exports.generateAttackBubble = ({ eventId }) => ({
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "攻擊技能",
        weight: "bold",
        size: "xl",
        margin: "md",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "冒險家",
            weight: "bold",
            size: "md",
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "image",
                url: "https://i.imgur.com/jzA0Pp9.jpeg",
                size: "xxs",
                align: "start",
                action: {
                  type: "postback",
                  data: JSON.stringify(
                    makeAttackPayload(
                      eventId,
                      RPGCharacter.Adventurer.key,
                      RPGCharacter.enumSkills.STANDARD
                    )
                  ),
                },
              },
            ],
            spacing: "md",
          },
        ],
        spacing: "sm",
        margin: "lg",
      },
      {
        type: "separator",
        margin: "lg",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "劍士",
            weight: "bold",
            size: "md",
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "image",
                url: "https://i.imgur.com/oqS9wAU.jpeg",
                size: "xxs",
                align: "start",
                action: {
                  type: "postback",
                  data: JSON.stringify(
                    makeAttackPayload(
                      eventId,
                      RPGCharacter.Swordman.key,
                      RPGCharacter.enumSkills.SKILL_ONE
                    )
                  ),
                },
              },
            ],
            spacing: "md",
          },
        ],
        spacing: "sm",
        margin: "lg",
      },
      {
        type: "separator",
        margin: "lg",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "法師",
            weight: "bold",
            size: "md",
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "image",
                url: "https://i.imgur.com/uZdWvhO.jpeg",
                size: "xxs",
                align: "start",
                action: {
                  type: "postback",
                  data: JSON.stringify(
                    makeAttackPayload(
                      eventId,
                      RPGCharacter.Mage.key,
                      RPGCharacter.enumSkills.SKILL_ONE
                    )
                  ),
                },
              },
            ],
            spacing: "md",
          },
        ],
        spacing: "sm",
        margin: "lg",
      },
      {
        type: "separator",
        margin: "lg",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "盜賊",
            weight: "bold",
            size: "md",
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "image",
                url: "https://i.imgur.com/jGqXGTf.jpeg",
                size: "xxs",
                align: "start",
                action: {
                  type: "postback",
                  data: JSON.stringify(
                    makeAttackPayload(
                      eventId,
                      RPGCharacter.Thief.key,
                      RPGCharacter.enumSkills.SKILL_ONE
                    )
                  ),
                },
              },
            ],
            spacing: "md",
          },
        ],
        spacing: "sm",
        margin: "lg",
      },
    ],
  },
});

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
  gold,
  exp,
}) => {
  start_time = format.asString("yyyy-MM-dd", start_time);
  end_time = format.asString("yyyy-MM-dd", end_time);

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
                  text: description || " ",
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

exports.generateOshirase = () => ({
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
                text: "雖然都可以進行遊玩，但訊息量將減至最低",
              },
            ],
            size: "xs",
            adjustMode: "shrink-to-fit",
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
});

/**
 * 產出冒險者卡片
 * @param {Object} param0
 * @param {String} param0.name 冒險者名稱
 * @param {String} param0.image 冒險者圖片
 * @param {String} param0.level 冒險者等級
 * @param {String} param0.exp 冒險者經驗值
 * @param {String} param0.expPercentage 冒險者經驗值 % 數值
 * @param {Number} param0.totalCost cost 總量
 */
exports.generateAdventureCard = ({
  name,
  image,
  level,
  exp,
  expPercentage,
  totalCost,
  jobName,
  jobAdvancement = 0,
}) => ({
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "冒險者小卡",
        weight: "bold",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [{ type: "separator", color: "#808080" }],
        paddingTop: "lg",
        paddingBottom: "lg",
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "image",
                url: `${image}`,
                size: "full",
                aspectMode: "cover",
                aspectRatio: "1:1",
              },
            ],
            cornerRadius: "100px",
            width: "64px",
            height: "64px",
            flex: 0,
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: `${name}`,
                weight: "bold",
                size: "md",
              },
              {
                type: "text",
                contents: [
                  { type: "span", text: `${jobName}` },
                  { type: "span", text: ` C${jobAdvancement}`, size: "xxs", color: "#808080" },
                ],
                size: "sm",
              },
              {
                type: "text",
                text: `Lv.${level}`,
                size: "sm",
                color: "#808080",
              },
            ],
            paddingStart: "lg",
            spacing: "xs",
          },
        ],
        alignItems: "center",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [{ type: "separator", color: "#808080" }],
        paddingTop: "lg",
        paddingBottom: "lg",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            contents: [
              { type: "span", text: "經驗：" },
              { type: "span", text: `${exp}` },
            ],
            size: "sm",
          },
          {
            type: "text",
            contents: [
              { type: "span", text: "cost：" },
              { type: "span", text: `${totalCost}/${config.get("worldboss.daily_limit")}` },
            ],
            size: "sm",
          },
        ],
        spacing: "sm",
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
        cornerRadius: "md",
        margin: "md",
      },
    ],
    backgroundColor: "#EDDFC4",
  },
});

/**
 * 產生規則 bubble
 * @param {Array} rules
 * @returns {Object}
 */
exports.generateRuleBubble = rules => {
  let ruleBoxes = rules.map(rule => generateRuleTextBox(rule));
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
              text: "規則說明",
            },
            {
              type: "box",
              layout: "vertical",
              contents: ruleBoxes,
              spacing: "md",
              paddingTop: "md",
            },
          ],
        },
      ],
    },
  };
};

function generateRuleTextBox(rule) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: "-",
        size: "xs",
        flex: 1,
        align: "center",
      },
      {
        type: "text",
        text: `${rule}`,
        wrap: true,
        size: "xs",
        flex: 10,
      },
    ],
  };
}

/**
 * 產出傷害履歷的 row
 * @param {Object} param0
 * @param {String} param0.damage 傷害
 * @param {String} param0.datetime 建立時間
 * @returns {Object}
 */
exports.generateDamageResumeRow = ({ damage, datetime }) => {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: damage,
        size: "xs",
        flex: 5,
        align: "center",
      },
      {
        type: "text",
        text: datetime,
        size: "xs",
        flex: 7,
      },
    ],
  };
};

/**
 * 產生傷害履歷的 bubble
 * @param {Array} rows
 * @returns {Object}
 */
exports.generateDamageResumeBubble = rows => {
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
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: i18n.__("template.damage"),
                  flex: 5,
                  size: "sm",
                  align: "center",
                },
                {
                  type: "text",
                  text: i18n.__("template.time"),
                  flex: 7,
                  size: "sm",
                },
              ],
            },
            {
              type: "separator",
              color: "#808080",
            },
            ...rows,
          ],
          paddingAll: "sm",
          spacing: "md",
        },
      ],
    },
  };
};

exports.generateCardStatusBubble = ({
  maxDamage,
  attendTimes,
  standardDamage,
  equipped,
  equipBonuses,
}) => {
  const liffUrl = getLiffUri("compact", "/Equipment");

  const equipRows = ["weapon", "armor", "accessory"].map(slot => {
    const item = equipped ? equipped[slot] : null;
    const label = SLOT_LABELS[slot];
    return {
      type: "text",
      contents: [
        { type: "span", text: `${label}：` },
        {
          type: "span",
          text: item ? item.name : "未裝備",
          weight: item ? "bold" : "regular",
          color: item ? RARITY_COLORS[item.rarity] || "#808080" : "#AAAAAA",
        },
      ],
      size: "sm",
    };
  });

  const bonusParts = [];
  if (equipBonuses) {
    if (equipBonuses.atk_percent) bonusParts.push(`ATK+${equipBonuses.atk_percent}%`);
    if (equipBonuses.crit_rate) bonusParts.push(`CRT+${equipBonuses.crit_rate}%`);
    if (equipBonuses.cost_reduction) bonusParts.push(`Cost-${equipBonuses.cost_reduction}`);
    if (equipBonuses.exp_bonus) bonusParts.push(`EXP+${equipBonuses.exp_bonus}`);
    if (equipBonuses.gold_bonus) bonusParts.push(`Gold+${equipBonuses.gold_bonus}`);
  }

  const equipSection = [
    {
      type: "box",
      layout: "vertical",
      contents: [{ type: "separator", color: "#808080" }],
      paddingTop: "lg",
      paddingBottom: "lg",
    },
    {
      type: "box",
      layout: "vertical",
      contents: [
        ...equipRows,
        ...(bonusParts.length > 0
          ? [{ type: "text", text: bonusParts.join("  "), size: "xxs", color: "#2E7D32" }]
          : []),
      ],
      paddingTop: "sm",
      paddingBottom: "sm",
      spacing: "sm",
    },
    {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "裝備管理",
          align: "center",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm",
        },
      ],
      backgroundColor: "#5D4037",
      paddingAll: "sm",
      cornerRadius: "md",
      margin: "lg",
      action: { type: "uri", label: "裝備管理", uri: liffUrl },
    },
  ];

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "狀態列",
          weight: "bold",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [{ type: "separator", color: "#808080" }],
          paddingTop: "lg",
          paddingBottom: "lg",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              contents: [
                { type: "span", text: i18n.__("template.damage") },
                { type: "span", text: "：" },
                { type: "span", text: standardDamage },
              ],
              size: "sm",
            },
            {
              type: "text",
              contents: [
                { type: "span", text: i18n.__("template.used_max_damage") },
                { type: "span", text: "：" },
                { type: "span", text: maxDamage },
              ],
              size: "sm",
            },
            {
              type: "text",
              contents: [
                { type: "span", text: i18n.__("template.attend_times") },
                { type: "span", text: "：" },
                { type: "span", text: `${attendTimes}` },
                { type: "span", text: " 次" },
              ],
              size: "sm",
            },
          ],
          paddingTop: "sm",
          paddingBottom: "sm",
          spacing: "sm",
        },
        ...equipSection,
      ],
      backgroundColor: "#EDDFC4",
    },
  };
};

/**
 * 產出近期紀錄的 bubble
 * @param {Array} rows
 */
exports.generateRecentlyEventBubble = rows => ({
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "近期討伐紀錄",
        weight: "bold",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "separator",
            color: "#808080",
          },
        ],
        paddingTop: "lg",
        paddingBottom: "lg",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [...rows],
        paddingTop: "sm",
        paddingBottom: "sm",
        spacing: "sm",
      },
    ],
    backgroundColor: "#EDDFC4",
  },
});

/**
 * 產出近期討伐紀錄的 row
 * @param {Object} param0
 * @param {String} param0.bossName
 * @param {String} param0.totalDamage
 */
exports.generateRecentlyEventRow = ({ bossName, totalDamage }) => ({
  type: "box",
  layout: "vertical",
  contents: [
    {
      type: "text",
      size: "sm",
      contents: [
        {
          type: "span",
          text: i18n.__("template.boss_name"),
          weight: "bold",
        },
        {
          type: "span",
          text: " ",
        },
        {
          type: "span",
          text: bossName,
        },
      ],
    },
    {
      type: "text",
      size: "sm",
      contents: [
        {
          type: "span",
          text: i18n.__("template.total_damage"),
          weight: "bold",
        },
        {
          type: "span",
          text: " ",
        },
        {
          type: "span",
          text: totalDamage,
        },
      ],
    },
    {
      type: "separator",
    },
  ],
});

const RARITY_COLORS = {
  common: "#808080",
  rare: "#3478FF",
  epic: "#A834FF",
  legendary: "#FF8C00",
};

const SLOT_LABELS = { weapon: "武器", armor: "防具", accessory: "飾品" };

/**
 * 產出裝備概覽 bubble（用於 #裝備 和 #冒險小卡）
 * @param {Object} equipped - { weapon, armor, accessory } 各 slot 物件或 null
 * @param {Object} bonuses - { atk_percent, crit_rate, cost_reduction, exp_bonus, gold_bonus }
 */
exports.generateEquipmentBubble = (equipped, bonuses) => {
  const liffUrl = getLiffUri("compact", "/Equipment");

  const slotRows = ["weapon", "armor", "accessory"].map(slot => {
    const item = equipped[slot];
    const label = SLOT_LABELS[slot];

    if (!item) {
      return {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: label,
            size: "sm",
            color: "#5D4037",
            flex: 2,
          },
          {
            type: "text",
            text: "- 未裝備 -",
            size: "sm",
            color: "#AAAAAA",
            flex: 5,
          },
        ],
        paddingAll: "xs",
      };
    }

    return {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: label,
          size: "sm",
          color: "#5D4037",
          flex: 2,
        },
        {
          type: "text",
          text: item.name,
          size: "sm",
          weight: "bold",
          color: RARITY_COLORS[item.rarity] || "#808080",
          flex: 5,
        },
      ],
      paddingAll: "xs",
    };
  });

  // 加成摘要
  const bonusParts = [];
  if (bonuses.atk_percent) bonusParts.push(`ATK+${bonuses.atk_percent}%`);
  if (bonuses.crit_rate) bonusParts.push(`CRT+${bonuses.crit_rate}%`);
  if (bonuses.cost_reduction) bonusParts.push(`Cost-${bonuses.cost_reduction}`);
  if (bonuses.exp_bonus) bonusParts.push(`EXP+${bonuses.exp_bonus}`);
  if (bonuses.gold_bonus) bonusParts.push(`Gold+${bonuses.gold_bonus}`);

  const contents = [
    {
      type: "text",
      text: "裝備一覽",
      weight: "bold",
    },
    {
      type: "separator",
      margin: "md",
      color: "#808080",
    },
    {
      type: "box",
      layout: "vertical",
      contents: slotRows,
      margin: "md",
      spacing: "xs",
    },
  ];

  if (bonusParts.length > 0) {
    contents.push(
      {
        type: "separator",
        margin: "md",
        color: "#808080",
      },
      {
        type: "text",
        text: bonusParts.join("  "),
        size: "xs",
        color: "#2E7D32",
        margin: "sm",
        wrap: true,
      }
    );
  }

  contents.push({
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "裝備管理",
        align: "center",
        color: "#FFFFFF",
        weight: "bold",
        size: "sm",
      },
    ],
    backgroundColor: "#5D4037",
    paddingAll: "sm",
    cornerRadius: "md",
    margin: "md",
    action: {
      type: "uri",
      label: "裝備管理",
      uri: liffUrl,
    },
  });

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents,
      backgroundColor: "#EDDFC4",
    },
  };
};
