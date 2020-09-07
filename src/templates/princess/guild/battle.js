exports.showBattleList = (context, data) => {
  context.sendFlex(`第${data.week}周次 - 戰隊清單`, {
    type: "carousel",
    contents: [
      genPreviewCover(data),
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
  context.sendFlex(
    `第${data.week}周次${data.boss}王`,
    genPreviewDetail({
      ...data.records,
      boss: data.boss,
      formId: data.formId,
      week: data.week,
      datas: data.datas,
      config: data.configs.find(config => config.boss == data.boss),
    })
  );
};

function genPreviewCover(option) {
  const { week, formId, configs } = option;
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
          text: `此份報名表為\n第${week}周目`,
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
          type: "button",
          action: {
            type: "uri",
            label: "Ian戰隊報名系統",
            uri: `https://guild.randosoru.me/forms/${formId}/week/${week}`,
          },
        },
      ],
    },
  };
}

function genPreviewDetail(option) {
  const {
    FullCount,
    NotFullCount,
    KyaryuCount,
    OtherCount,
    boss,
    week,
    datas,
    config,
    formId,
  } = option;
  console.log(config);
  var bossConfig = { name: `${boss}王`, image: "https://i.imgur.com/zsAFota.png", ...config };

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
                uri: `https://guild.randosoru.me/forms/${formId}/week/${week}`,
              },
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: bossConfig.name,
                  weight: "bold",
                  align: "center",
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
                  height: "26px",
                  paddingAll: "2px",
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
                  height: "26px",
                  paddingAll: "2px",
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
                  height: "26px",
                  paddingAll: "2px",
                },
              ],
              borderWidth: "2px",
              borderColor: "#000000",
              cornerRadius: "5px",
            },
          ],
          margin: "md",
          paddingAll: "3px",
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
