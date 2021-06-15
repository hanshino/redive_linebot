const liffUri = `https://liff.line.me/${process.env.LINE_LIFF_COMPACT_ID}`;
/**
 * 顯示好友小卡
 * @param {Context} context
 * @param {Object} params
 * @param {String} params.uid
 * @param {String} params.server
 * @param {String} params.background
 * @param {String} params.nickname
 */
exports.showCard = (context, params) => {
  let { uid, server, background, clan_name = "-" } = params;
  const {
    user_name,
    user_comment = "-",
    team_level = "-",
    arena_rank = "-",
    grand_arena_rank = "-",
    unit_num = "-",
    total_power = "-",
    tower_cleared_floor_num = "-",
    tower_cleared_ex_quest_count = "-",
  } = params.user_info;
  context.sendFlex("好友小卡", {
    type: "bubble",
    size: "giga",
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
              url: background,
              size: "full",
              aspectMode: "cover",
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
                  contents: [
                    {
                      type: "text",
                      text: `${user_name}`,
                      color: "#00FFAC",
                      weight: "bold",
                    },
                    {
                      type: "text",
                      text: `${user_comment}`,
                      size: "xxs",
                      adjustMode: "shrink-to-fit",
                      color: "#FFAC97",
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      color: "#FFFFFF",
                      contents: [
                        {
                          type: "span",
                          text: "主角等級",
                          weight: "bold",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: `${team_level}`,
                        },
                      ],
                    },
                    {
                      type: "text",
                      color: "#FFFFFF",
                      contents: [
                        {
                          type: "span",
                          text: "解放角色數量",
                          weight: "bold",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: `${unit_num}`,
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      color: "#FFFFFF",
                      contents: [
                        {
                          type: "span",
                          text: "戰鬥競技場",
                          weight: "bold",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: `${arena_rank}`,
                        },
                      ],
                    },
                    {
                      type: "text",
                      color: "#FFFFFF",
                      contents: [
                        {
                          type: "span",
                          text: "公主競技場",
                          weight: "bold",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: `${grand_arena_rank}`,
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      color: "#FFFFFF",
                      contents: [
                        {
                          type: "span",
                          text: "露娜之塔",
                          weight: "bold",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: `${tower_cleared_floor_num}`,
                        },
                      ],
                    },
                    {
                      type: "text",
                      color: "#FFFFFF",
                      contents: [
                        {
                          type: "span",
                          text: "EX冒險",
                          weight: "bold",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: `${tower_cleared_ex_quest_count}`,
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "text",
                      color: "#FFFFFF",
                      contents: [
                        {
                          type: "span",
                          text: "所屬戰隊",
                          weight: "bold",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: `${clan_name}`,
                        },
                      ],
                    },
                    {
                      type: "text",
                      color: "#FFFFFF",
                      contents: [
                        {
                          type: "span",
                          text: "全角色戰力",
                          weight: "bold",
                        },
                        {
                          type: "span",
                          text: " ",
                        },
                        {
                          type: "span",
                          text: `${total_power}`,
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: [uid.substr(0, 3), uid.substr(3, 3), uid.substr(6)].join(" "),
                      weight: "bold",
                      color: "#FF80CA",
                    },
                  ],
                  position: "absolute",
                  offsetEnd: "xs",
                  offsetBottom: "xs",
                },
              ],
              paddingAll: "xxl",
              spacing: "sm",
            },
          ],
          backgroundColor: "#808080AC",
          position: "absolute",
          offsetBottom: "0px",
          width: "100%",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: `${server}`,
              color: "#ABCDEF",
              size: "xs",
            },
          ],
          position: "absolute",
          cornerRadius: "lg",
          backgroundColor: "#3142A8CD",
          paddingAll: "5px",
          offsetTop: "3%",
          offsetStart: "3%",
        },
      ],
      paddingAll: "0px",
    },
  });
};

exports.showBindingPage = context => {
  context.sendFlex("綁定訊息", {
    type: "bubble",
    size: "nano",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "尚未綁定\n馬上進行設定",
          align: "center",
          wrap: true,
          color: "#FFFFFF",
        },
      ],
      backgroundColor: "#E94196",
      action: {
        type: "uri",
        uri: `${liffUri}?reactRedirectUri=/Princess/Profile`,
      },
    },
  });
};
