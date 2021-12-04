const { getLiffUri, assemble } = require("../../common");
const i18n = require("../../../util/i18n");
const datefromat = require("dateformat");

exports.sendSignFeedback = (context, template, data, sender) => {
  return context.replyText(assemble(data, template), { sender });
};

exports.showBattleList = (context, data) => {
  context.replyFlex(`第${data.week}周次 - 戰隊清單`, {
    type: "carousel",
    contents: [
      genPreviewCover({ ...data, groupId: context.event.source.groupId }),
      genPreviewDetail({
        ...data.records[0],
        boss: 1,
        formId: data.formId,
        week: data.week,
        datas: data.datas.filter(data => data.boss === 1),
        config: data.configs.find(config => config.boss == 1),
      }),
      genPreviewDetail({
        ...data.records[1],
        boss: 2,
        formId: data.formId,
        week: data.week,
        datas: data.datas.filter(data => data.boss === 2),
        config: data.configs.find(config => config.boss == 2),
      }),
      genPreviewDetail({
        ...data.records[2],
        boss: 3,
        formId: data.formId,
        week: data.week,
        datas: data.datas.filter(data => data.boss === 3),
        config: data.configs.find(config => config.boss == 3),
      }),
      genPreviewDetail({
        ...data.records[3],
        boss: 4,
        formId: data.formId,
        week: data.week,
        datas: data.datas.filter(data => data.boss === 4),
        config: data.configs.find(config => config.boss == 4),
      }),
      genPreviewDetail({
        ...data.records[4],
        boss: 5,
        formId: data.formId,
        week: data.week,
        datas: data.datas.filter(data => data.boss === 5),
        config: data.configs.find(config => config.boss == 5),
      }),
    ],
  });
};

exports.showBattleDetail = (context, data) => {
  let message = genPreviewDetail({
    ...data.records,
    boss: data.boss,
    formId: data.formId,
    week: data.week,
    datas: data.datas,
    config: data.configs.find(config => config.boss == data.boss),
  });

  context.replyFlex(`第${data.week}周次${data.boss}王`, message);
};

exports.showReportList = (context, records) => {
  let templates = {
    type: "bubble",
    size: "nano",
    body: {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "{week} 周",
              align: "center",
            },
            {
              type: "text",
              text: "{boss} 王",
              align: "center",
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "spacer",
            },
            {
              type: "text",
              text: "{type}",
              gravity: "center",
              color: "{color}",
              size: "xl",
            },
          ],
        },
      ],
      action: {
        type: "message",
        text: "#傷害回報 {id} {week} {boss}",
      },
    },
  };

  let bubbles = records.map(record => {
    return JSON.parse(assemble(record, JSON.stringify(templates)));
  });

  let flexMessage;
  if (bubbles.length === 1) {
    flexMessage = bubbles[0];
  } else {
    flexMessage = {
      type: "carousel",
      contents: bubbles,
    };
  }

  context.replyFlex("回報傷害清單", flexMessage);
};

/**
 * 多群組選擇用
 * @param {Context} context
 * @param {Array<{name: String, count: Number, week: Number}>} groups
 */
exports.showGuildList = (context, groups) => {
  let bubbles = groups.map(group =>
    JSON.parse(
      assemble(
        group,
        JSON.stringify({
          type: "bubble",
          size: "nano",
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "{groupName}",
                size: "lg",
                weight: "bold",
              },
              {
                type: "text",
                text: "人數：{count} 人",
              },
              {
                type: "text",
                text: "周目：{week} 周",
              },
            ],
            action: {
              type: "message",
              text: "#我要回報 {formId}",
            },
          },
        })
      )
    )
  );

  let flexMessage = { type: "carousel", contents: bubbles };

  context.replyFlex("選擇要回報的群組", flexMessage);
};

exports.genReportInformation = viewData => {
  let teamBox = viewData.team.reverse().map(char => {
    let id = char["unit_id"] + char["rarity"] * 10;
    let url = `https://pcredivewiki.tw/static/images/unit/icon_unit_${id}.png`;
    return { type: "image", url };
  });
  let tempalte = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: teamBox,
          spacing: "sm",
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
                  text: "總傷害：",
                },
                {
                  type: "span",
                  text: "{damage}",
                },
              ],
              color: "#FFFFFF",
            },
          ],
          margin: "md",
          paddingAll: "sm",
        },
      ],
      spacing: "sm",
      backgroundColor: "#AA3388AB",
    },
  };

  return JSON.parse(assemble({ damage: viewData.totalDamage }, JSON.stringify(tempalte)));
};

function genPreviewCover(option) {
  const { week, formId, configs, groupId } = option;
  var bossImages = configs.sort((a, b) => a.boss - b.boss).map(config => config.image);
  var defaultImg = "https://i.imgur.com/zsAFota.png";

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: `第${week}周目`,
          wrap: true,
          weight: "bold",
          align: "center",
          size: "lg",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            ...[0, 1, 2, 3, 4].map(index => ({
              type: "image",
              url: bossImages[index] || defaultImg,
            })),
          ],
          spacing: "md",
        },
      ],
    },
    footer: {
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
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "filler",
                    },
                    {
                      type: "text",
                      text: "🌏 網站版",
                      align: "center",
                      weight: "bold",
                    },
                    {
                      type: "filler",
                    },
                  ],
                },
              ],
              action: {
                type: "uri",
                uri: `${getLiffUri("ian")}/forms/${formId}/week/${week}`,
              },
              paddingAll: "5px",
              cornerRadius: "md",
              borderWidth: "2px",
              borderColor: "#880066",
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
                      type: "filler",
                    },
                    {
                      type: "text",
                      text: "🔧 設定頁",
                      align: "center",
                      weight: "bold",
                    },
                    {
                      type: "filler",
                    },
                  ],
                },
              ],
              action: {
                type: "uri",
                uri: `${getLiffUri("Ian")}/forms/${formId}/modify`,
              },
              paddingAll: "5px",
              cornerRadius: "md",
              borderColor: "#880066",
              borderWidth: "2px",
            },
          ],
          spacing: "sm",
          paddingAll: "3px",
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
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "filler",
                    },
                    {
                      type: "text",
                      text: "📋 總覽頁",
                      align: "center",
                      weight: "bold",
                    },
                    {
                      type: "filler",
                    },
                  ],
                },
              ],
              action: {
                type: "uri",
                uri: `${getLiffUri("Ian")}/forms/${formId}/overview`,
              },
              paddingAll: "5px",
              cornerRadius: "md",
              borderColor: "#880066",
              borderWidth: "2px",
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
                      type: "filler",
                    },
                    {
                      type: "text",
                      text: "⌨ 指令表",
                      align: "center",
                      weight: "bold",
                    },
                    {
                      type: "filler",
                    },
                  ],
                },
              ],
              action: {
                type: "uri",
                uri: `${getLiffUri("compact")}?reactRedirectUri=/Panel/Group/Battle/Control`,
              },
              paddingAll: "5px",
              cornerRadius: "md",
              borderColor: "#880066",
              borderWidth: "2px",
            },
          ],
          spacing: "sm",
          paddingAll: "3px",
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
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "filler",
                    },
                    {
                      type: "text",
                      text: "⚙ 管理頁",
                      align: "center",
                      weight: "bold",
                    },
                    {
                      type: "filler",
                    },
                  ],
                },
              ],
              action: {
                type: "uri",
                uri: `${getLiffUri("full")}?reactRedirectUri=/Group/${groupId}/Battle/Config`,
              },
              paddingAll: "5px",
              cornerRadius: "md",
              borderColor: "#880066",
              borderWidth: "2px",
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
                      type: "filler",
                    },
                    {
                      type: "text",
                      text: "⏱️ 刀軸轉換",
                      align: "center",
                      weight: "bold",
                    },
                    {
                      type: "filler",
                    },
                  ],
                },
              ],
              action: {
                type: "uri",
                uri: `${getLiffUri("full")}?reactRedirectUri=/Tools/BattleTime`,
              },
              paddingAll: "5px",
              cornerRadius: "md",
              borderColor: "#880066",
              borderWidth: "2px",
            },
          ],
          spacing: "sm",
          paddingAll: "3px",
        },
      ],
      spacing: "md",
    },
  };
}

function genPreviewDetail(option) {
  const { FullCount, NotFullCount, KyaryuCount, OtherCount, boss, week, datas, config, formId } =
    option;

  let bossConfig = { name: `${boss}王`, image: "", ...config };
  bossConfig.image = bossConfig.image || "https://i.imgur.com/zsAFota.png";
  let stage = 0;

  switch (true) {
    case week >= 45:
      stage = 4;
      break;
    case week >= 35:
      stage = 3;
      break;
    case week >= 11:
      stage = 2;
      break;
    case week >= 4:
      stage = 1;
      break;
  }

  let hp = bossConfig.hp[stage];

  let recordsDetail = datas.map((data, index) => {
    return {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: `${index + 1}`,
          flex: 2,
        },
        {
          type: "text",
          text: `${data.user.name}`,
          flex: 3,
        },
        {
          type: "text",
          text: `${getStatusText(data.status)}`,
          flex: 3,
        },
        {
          type: "text",
          text: "取消",
          flex: 3,
          color: "#880000",
          action: {
            type: "postback",
            data: JSON.stringify({
              action: "battleCancel",
              week: week,
              boss: boss,
              recordId: data.id,
            }),
          },
        },
      ],
    };
  });

  let recordDamages = datas.filter(data => data.damage).map(data => data.damage);
  let recordDamage =
    recordDamages.length === 0 ? 0 : recordDamages.reduce((pre, curr) => pre + curr);
  // 超標修正
  recordDamage = recordDamage > hp ? hp : recordDamage;
  let causeRate = Math.round((recordDamage / hp) * 100);

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "image",
              url: bossConfig.image,
              flex: 5,
              gravity: "bottom",
              action: {
                type: "uri",
                uri: `${getLiffUri("Ian")}/forms/${formId}/week/${week}`,
              },
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: `${week}周 - ${bossConfig.name}`,
                  weight: "bold",
                  align: "center",
                  wrap: true,
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "完整",
                      weight: "bold",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: `${FullCount}`,
                    },
                  ],
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "補償",
                      weight: "bold",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: `${NotFullCount}`,
                    },
                  ],
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "凱留",
                      weight: "bold",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: `${KyaryuCount}`,
                    },
                  ],
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "其他",
                      weight: "bold",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: `${OtherCount}`,
                    },
                  ],
                },
              ],
              flex: 7,
              spacing: "xs",
              paddingStart: "6px",
            },
          ],
          margin: "sm",
          paddingAll: "2px",
        },
        {
          type: "box",
          paddingAll: "5px",
          layout: "vertical",
          contents: [
            {
              type: "text",
              size: "sm",
              contents: [],
              text: `${100 - causeRate}%`,
              align: "end",
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  contents: [],
                  width: `${100 - causeRate}%`,
                  height: "5px",
                  backgroundColor: "#FF0000AA",
                },
              ],
              backgroundColor: "#808080",
              height: "5px",
            },
            {
              type: "text",
              text: `${hp - recordDamage}`,
              size: "sm",
              align: "end",
            },
          ],
        },
        {
          type: "separator",
          margin: "sm",
          color: "#808080",
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
                      text: "完整",
                      align: "center",
                      action: {
                        type: "postback",
                        data: JSON.stringify({
                          action: "battleSignUp",
                          week: week,
                          boss: boss,
                          type: 1,
                        }),
                      },
                    },
                  ],
                  backgroundColor: "#99ff33",
                  paddingAll: "5px",
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "補償",
                      align: "center",
                      action: {
                        type: "postback",
                        data: JSON.stringify({
                          action: "battleSignUp",
                          week: week,
                          boss: boss,
                          type: 2,
                        }),
                      },
                    },
                  ],
                  backgroundColor: "#66ccff",
                  paddingAll: "5px",
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "凱留",
                      align: "center",
                      action: {
                        type: "postback",
                        data: JSON.stringify({
                          action: "battleSignUp",
                          week: week,
                          boss: boss,
                          type: 3,
                        }),
                      },
                    },
                  ],
                  backgroundColor: "#cc66ff",

                  paddingAll: "5px",
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "其他",
                      align: "center",
                      action: {
                        type: "uri",
                        uri: `${getLiffUri(
                          "Compact"
                        )}?reactRedirectUri=/Panel/Group/Battle/${week}/${boss}?damage=${hp}`,
                      },
                    },
                  ],
                  backgroundColor: "#808080",
                  paddingAll: "5px",
                },
              ],
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
                      type: "text",
                      text: "物一刀",
                      align: "center",
                      action: {
                        type: "postback",
                        data: JSON.stringify({
                          action: "battleSignUp",
                          week: week,
                          boss: boss,
                          type: 1,
                          damage: `${hp}`,
                          comment: "物刀一刀收",
                        }),
                      },
                    },
                  ],
                  backgroundColor: "#ffcc66",
                  paddingAll: "5px",
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "法一刀",
                      align: "center",
                      action: {
                        type: "postback",
                        data: JSON.stringify({
                          action: "battleSignUp",
                          week: week,
                          boss: boss,
                          type: 1,
                          damage: `${hp}`,
                          comment: "法刀一刀收",
                        }),
                      },
                    },
                  ],
                  backgroundColor: "#3399ff",
                  paddingAll: "5px",
                },
              ],
            },
          ],
          margin: "md",
          borderWidth: "2px",
          borderColor: "#000000",
          cornerRadius: "5px",
        },
        {
          type: "separator",
          margin: "sm",
          color: "#808080",
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
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      text: "#",
                      flex: 2,
                    },
                    {
                      type: "text",
                      text: "名稱",
                      flex: 3,
                    },
                    {
                      type: "text",
                      text: "類型",
                      flex: 3,
                    },
                    {
                      type: "text",
                      text: "操作",
                      flex: 3,
                    },
                  ],
                },
                ...recordsDetail,
              ],
              spacing: "sm",
              paddingAll: "2px",
            },
          ],
          margin: "md",
          spacing: "sm",
        },
      ],
    },
  };
}

function getStatusText(status) {
  switch (status) {
    case 1:
      return "完整";
    case 2:
      return "補償";
    case 3:
      return "凱留";
    default:
      return "其他";
  }
}

/**
 * 顯示完成出刀列表
 * @param {Context} context
 * @param {Object[]} FinishMemberList
 * @param {String} FinishMemberList[].displayName
 * @param {String} FinishMemberList[].createDTM
 * @param {Boolean} FinishMemberList[].isSignin
 */
exports.showFinishList = (context, FinishMemberList) => {
  let date = new Date();
  const Today = [
    date.getFullYear(),
    ("0" + (date.getMonth() + 1)).substr(-2),
    ("0" + date.getDate()).substr(-2),
  ].join(".");
  let isSignList = FinishMemberList.filter(list => list.isSignin);
  let notSignList = FinishMemberList.filter(list => !list.isSignin);
  context.replyFlex("出刀簽到表", {
    type: "carousel",
    contents: [
      {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "🏆成功人士",
              weight: "bold",
              color: "#9B1C31",
            },
          ],
          backgroundColor: "#80C5DE",
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: "姓名",
                  weight: "bold",
                  flex: 7,
                },
                {
                  type: "text",
                  text: "時間",
                  weight: "bold",
                  flex: 5,
                },
              ],
            },
            ...isSignList.map(genMemberRow),
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "separator",
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: `總計${isSignList.length}位`,
                  size: "xs",
                  align: "start",
                  flex: 3,
                },
                {
                  type: "text",
                  text: `${Today} Generated by 布丁機器人`,
                  align: "end",
                  color: "#808080",
                  size: "xs",
                  margin: "sm",
                  flex: 9,
                },
              ],
            },
          ],
        },
      },
      {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "🎮出刀機器",
              weight: "bold",
              color: "#FEFEFE",
            },
          ],
          backgroundColor: "#9B1C31",
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: "姓名",
                  weight: "bold",
                  flex: 7,
                },
                {
                  type: "text",
                  text: "時間",
                  weight: "bold",
                  flex: 5,
                },
              ],
            },
            ...notSignList.map(genMemberRow),
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "separator",
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: `總計${notSignList.length}位`,
                  size: "xs",
                  align: "start",
                  flex: 3,
                },
                {
                  type: "text",
                  text: `${Today} Generated by 布丁機器人`,
                  align: "end",
                  color: "#808080",
                  size: "xs",
                  margin: "sm",
                  flex: 9,
                },
              ],
            },
          ],
        },
      },
    ],
  });
};

function genMemberRow(memberData) {
  let date,
    strDate = "-";
  if (memberData.createDTM) {
    date = new Date(memberData.createDTM);
    strDate =
      [("0" + (date.getMonth() + 1)).substr(-2), date.getDate()].join("/") +
      " " +
      [("0" + date.getHours()).substr(-2), ("0" + date.getMinutes()).substr(-2)].join(":");
  }

  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: memberData.displayName || "路人甲",
        flex: 7,
      },
      {
        type: "text",
        text: strDate,
        flex: 5,
      },
    ],
  };
}

/**
 * 產出戰隊狀態的泡泡
 * @param {Object} data 資料
 * @param {Number} data.server
 * @param {String} data.leaderUnit
 * @param {String} data.clanName
 * @param {String} data.leaderName
 * @param {Number} data.rank
 * @param {Number} data.score
 * @param {Object} data.status
 * @param {Number} data.status.boss
 * @param {Number} data.status.week
 * @param {Number} data.status.stage
 * @param {Number} data.ts
 * @param {Object} nearbyBox 由`genNearbyBox`產生的資料
 */
exports.genGuildStatusBubble = (data, nearbyBox) => {
  let { leaderUnit, clanName, leaderName, rank, score, status, ts, server } = data;
  let scoreText = new Intl.NumberFormat("en").format(score);
  let date = datefromat(new Date(ts * 1000), "yyyy-mm-dd HH:MM");
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
                  type: "image",
                  url: leaderUnit,
                  size: "sm",
                  flex: 1,
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: i18n.__("server." + server),
                    },
                    {
                      type: "text",
                      text: clanName,
                      adjustMode: "shrink-to-fit",
                      weight: "bold",
                    },
                    {
                      type: "text",
                      contents: [
                        {
                          type: "span",
                          text: "隊長",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: leaderName,
                        },
                      ],
                      size: "sm",
                    },
                  ],
                  flex: 3,
                  paddingStart: "md",
                },
              ],
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
                      text: "目前排名",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: `${rank}`,
                    },
                  ],
                  size: "sm",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "目前分數",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: scoreText,
                    },
                  ],
                  size: "sm",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "目前狀態",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: i18n.__("battle.status", status),
                    },
                  ],
                  size: "sm",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: "紀錄時間",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: date,
                    },
                  ],
                  size: "sm",
                },
              ],
              spacing: "xs",
              paddingAll: "xs",
            },
          ],
          // borderWidth: "light",
          // borderColor: "#808080",
          // cornerRadius: "sm",
          paddingAll: "md",
        },
        {
          type: "separator",
          color: "#808080",
        },
        nearbyBox,
      ],
    },
  };
};

/**
 * 產出附近排名資料Box
 * @param {Array<{rank: Number, clanName: String, status: Object, diff: Number}>} data 資料
 */
exports.genNearbyBox = data => {
  let rows = data.map(genNearbyRow);
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: "#",
            flex: 1,
            weight: "bold",
            align: "center",
            size: "sm",
          },
          {
            type: "text",
            text: "戰隊",
            flex: 4,
            weight: "bold",
            size: "sm",
          },
          {
            type: "text",
            text: "狀態",
            flex: 3,
            weight: "bold",
            size: "sm",
          },
        ],
      },
      ...rows,
    ],
    // borderWidth: "light",
    // borderColor: "#006412",
    paddingAll: "md",
    // cornerRadius: "sm",
    margin: "sm",
  };
};

function genNearbyRow({ rank, clanName, status, diff }) {
  let color = "#808080";
  let diffText = "－";
  if (diff > 0) {
    diffText = `+${new Intl.NumberFormat("en").format(diff)}`;
    color = "#00CA12";
  } else if (diff < 0) {
    diffText = `${new Intl.NumberFormat("en").format(diff)}`;
    color = "#CA1200";
  }
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: `${rank}`,
        flex: 1,
        size: "xs",
        align: "center",
      },
      {
        type: "text",
        text: `${clanName}`,
        flex: 4,
        size: "xs",
      },
      {
        type: "text",
        flex: 3,
        size: "xs",
        contents: [
          {
            type: "span",
            text: i18n.__("battle.status", status),
          },
          {
            type: "span",
            text: "\n(",
          },
          {
            type: "span",
            text: `${diffText}`,
            color,
          },
          {
            type: "span",
            text: ")",
          },
        ],
        wrap: true,
      },
    ],
  };
}

/**
 * 產出戰隊狀態選單按鈕
 * @param {Number} server
 * @param {String} leaderHash
 */
exports.genGuildStatusPanel = (server, leaderHash) => {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "戰隊詳細",
            uri: `https://randosoru.me/clanRanking/#/clan/${server}/${leaderHash}`,
          },
          style: "secondary",
        },
        {
          type: "button",
          action: {
            type: "uri",
            label: "全服排行",
            uri: `https://randosoru.me/clanRanking/#/?server=${server}`,
          },
          style: "secondary",
        },
      ],
      spacing: "sm",
    },
  };
};
