const CharacterManual = {
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      { type: "text", text: "👑角色資訊查詢指令", align: "center", weight: "bold" },
      {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "#角色裝備、#裝備需求、#裝備", size: "sm" },
          { type: "text", text: "#專武資訊、#角色專武、#專武", size: "sm" },
          { type: "text", text: "#角色行動、#行動模式", size: "sm" },
          { type: "text", text: "#角色、#公主", size: "sm" },
          { type: "text", text: "#角色資訊", size: "sm" },
          { type: "text", text: "#角色技能", size: "sm" },
          { type: "text", text: "#rank推薦", size: "sm" },
          { type: "separator", margin: "xs" },
          {
            type: "text",
            contents: [
              { type: "span", text: "參數：", size: "sm" },
              { type: "span", text: "角色名稱、角色暱稱", size: "sm" },
            ],
            margin: "sm",
          },
          { type: "separator", margin: "xs" },
          {
            type: "text",
            contents: [
              { type: "span", text: "範例：", size: "sm" },
              { type: "span", text: "#角色 月月、#專武 黑騎", size: "sm" },
            ],
            margin: "sm",
          },
        ],
        borderColor: "#808080",
        borderWidth: "light",
        cornerRadius: "xs",
        paddingAll: "sm",
      },
      { type: "text", text: "👑其餘角色指令", align: "center", weight: "bold" },
      {
        type: "box",
        layout: "vertical",
        contents: [{ type: "text", text: "#人權", size: "sm" }],
        borderColor: "#808080",
        borderWidth: "light",
        cornerRadius: "xs",
        paddingAll: "sm",
      },
      { type: "text", text: "🍮布丁線上真人客服", align: "center", weight: "bold" },
      {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "#召喚布丁、#幫助、#求救、#回報", wrap: true, size: "sm" },
          { type: "separator", margin: "sm" },
          { type: "text", text: "參數：問題內容", wrap: true, margin: "sm", size: "sm" },
          { type: "separator", margin: "sm" },
          {
            type: "text",
            text: "範例：#回報 角色功能壞掉啦～",
            wrap: true,
            margin: "sm",
            size: "sm",
          },
        ],
        borderColor: "#808080",
        borderWidth: "light",
        cornerRadius: "xs",
        paddingAll: "sm",
      },
    ],
    spacing: "sm",
  },
};
const GroupManual = {
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
            text: "群組功能",
            align: "center",
            size: "lg",
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "功能解說",
            size: "sm",
            weight: "bold",
          },
          {
            type: "text",
            text: "在群組當中紀錄每次說話時間，透過伺服器的數據整理分析後，顯示各群組的活躍狀況。",
            size: "xxs",
            wrap: true,
            color: "#808080",
            offsetStart: "md",
          },
        ],
        spacing: "sm",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "注意事項",
            size: "sm",
            weight: "bold",
          },
          {
            type: "text",
            text: "只在群組當中進行紀錄，每個月1號進行資料重置。\n偶爾伺服器維護將導致數據誤差。",
            size: "xxs",
            wrap: true,
            color: "#808080",
            offsetStart: "md",
          },
        ],
        spacing: "sm",
        margin: "sm",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "指令",
            size: "sm",
            weight: "bold",
          },
          {
            type: "text",
            text:
              "#群組管理\n內包含群組設定功能，群組設定內可將訊息同步至Discord的超強功能，還可以將布丁大部分的功能進行開關，打造客製化的布丁機器人！",
            size: "xxs",
            wrap: true,
            color: "#808080",
            offsetStart: "md",
          },
        ],
        spacing: "sm",
        margin: "sm",
      },
      {
        type: "text",
        text: "👑戰隊報名系統",
        align: "center",
        weight: "bold",
        margin: "sm",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            size: "sm",
            text: "使用說明手冊",
            align: "center",
          },
        ],
        borderColor: "#808080",
        borderWidth: "light",
        cornerRadius: "md",
        paddingAll: "md",
        margin: "sm",
        action: {
          type: "uri",
          label: "action",
          uri: "https://hackmd.io/@hanshino/SkZqVVkww",
        },
      },
    ],
  },
};
const OtherManual = {
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      { type: "text", text: "👑公主連結前作劇情", align: "center", weight: "bold" },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            size: "sm",
            text: "#前作、#前作劇情、#公連歌曲、#前作個人劇情",
            wrap: true,
          },
        ],
        borderColor: "#808080",
        borderWidth: "light",
        cornerRadius: "xs",
        paddingAll: "sm",
      },
      { type: "text", text: "其他功能指令", align: "center", weight: "bold" },
      {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", size: "sm", text: "#新番、#抽、#角色聲優、#布丁贊助", wrap: true },
        ],
        borderColor: "#808080",
        borderWidth: "light",
        cornerRadius: "xs",
        paddingAll: "sm",
      },
      { type: "text", text: "👑轉蛋指令", align: "center", weight: "bold" },
      {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", size: "sm", text: "#抽", wrap: true },
          { type: "separator" },
          { type: "text", size: "sm", text: "參數：角色分類" },
          { type: "separator" },
          { type: "text", size: "sm", text: "範例：#抽 泳裝、#抽 萬聖節" },
        ],
        borderColor: "#808080",
        borderWidth: "light",
        cornerRadius: "xs",
        paddingAll: "sm",
        margin: "sm",
      },
      { type: "text", text: "👑公會戰指令", align: "center", weight: "bold" },
      {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", size: "sm", text: "#XX月公會戰", wrap: true },
          { type: "separator", margin: "sm" },
          {
            type: "text",
            size: "sm",
            text: "注意：請以國字輸入\n範例：#十一月公會戰",
            wrap: true,
            margin: "sm",
          },
        ],
        borderColor: "#808080",
        borderWidth: "light",
        cornerRadius: "xs",
        paddingAll: "sm",
      },
    ],
    spacing: "md",
  },
};
const liffUri = `https://liff.line.me/${process.env.LINE_LIFF_ID}`;
const PuddingStatus = {
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "image",
        url: "https://i.imgur.com/SW3GwIA.png",
        size: "full",
        aspectMode: "cover",
        gravity: "top",
        aspectRatio: "7:9",
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
                type: "text",
                text: "布丁運行狀態",
                size: "xl",
                color: "#ffffff",
                weight: "bold",
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "filler",
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "filler",
                  },
                  {
                    type: "text",
                    text: "前往查看",
                    color: "#ffffff",
                    flex: 0,
                    offsetTop: "-2px",
                  },
                  {
                    type: "filler",
                  },
                ],
                spacing: "sm",
              },
              {
                type: "filler",
              },
            ],
            borderWidth: "1px",
            cornerRadius: "4px",
            spacing: "sm",
            borderColor: "#ffffff",
            margin: "xxl",
            height: "40px",
            action: {
              type: "uri",
              label: "action",
              uri: liffUri,
            },
          },
        ],
        position: "absolute",
        offsetBottom: "0px",
        offsetStart: "0px",
        offsetEnd: "0px",
        backgroundColor: "#00bcd488",
        paddingAll: "20px",
        paddingTop: "18px",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "News",
            color: "#ffffff",
            align: "center",
            size: "xs",
            offsetTop: "3px",
          },
        ],
        position: "absolute",
        cornerRadius: "20px",
        offsetTop: "18px",
        backgroundColor: "#ff334b",
        offsetStart: "18px",
        height: "25px",
        width: "53px",
      },
    ],
    paddingAll: "0px",
  },
};

module.exports = context => {
  context.sendFlex("使用說明", {
    type: "carousel",
    contents: [PuddingStatus, CharacterManual, GroupManual, OtherManual],
  });
};
