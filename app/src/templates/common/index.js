/**
 * 存放通用函式庫
 */

const LINK_THEMES = {
  indigo: { solid: "#4F46E5", soft: "#EEF2FF" },
  emerald: { solid: "#059669", soft: "#ECFDF5" },
  amber: { solid: "#D97706", soft: "#FFFBEB" },
  rose: { solid: "#E11D48", soft: "#FFF1F2" },
  cyan: { solid: "#0891B2", soft: "#ECFEFF" },
  slate: { solid: "#334155", soft: "#F1F5F9" },
};

const MUTED_TEXT = "#8A8A8A";
const CHEVRON_COLOR = "#BBBBBB";
const DIVIDER_COLOR = "#EEEEEE";

function resolveTheme(theme) {
  return LINK_THEMES[theme] || LINK_THEMES.indigo;
}

function buildMenuRow({ icon, title, subtitle, url, theme }) {
  const t = resolveTheme(theme);
  const textContents = [{ type: "text", text: title, weight: "bold", size: "sm" }];
  if (subtitle) {
    textContents.push({
      type: "text",
      text: subtitle,
      size: "xxs",
      color: MUTED_TEXT,
      margin: "xs",
    });
  }

  return {
    type: "box",
    layout: "horizontal",
    paddingAll: "md",
    spacing: "md",
    action: { type: "uri", label: title, uri: url },
    contents: [
      {
        type: "box",
        layout: "vertical",
        width: "36px",
        height: "36px",
        backgroundColor: t.soft,
        cornerRadius: "8px",
        justifyContent: "center",
        contents: [
          {
            type: "text",
            text: icon,
            align: "center",
            color: t.solid,
            size: "lg",
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        justifyContent: "center",
        contents: textContents,
      },
      {
        type: "text",
        text: "›",
        color: CHEVRON_COLOR,
        size: "xl",
        flex: 0,
        gravity: "center",
      },
    ],
  };
}

module.exports = {
  LINK_THEMES,

  assemble: function (mapData, strData) {
    var objMapData = {};

    Object.keys(mapData).forEach(key => {
      let newIndex = "{" + key.toLowerCase() + "}";
      objMapData[newIndex] = mapData[key];
    });

    var re = new RegExp(Object.keys(objMapData).join("|"), "gi");

    var strResult = strData.replace(re, function (matched) {
      matched = matched.toLowerCase();
      return objMapData[matched];
    });

    return strResult;
  },

  /**
   * 取得Liff網址
   * @param {String} type ian, compact, full, tall
   * @param {String} path 路徑
   */
  getLiffUri: function (type, path) {
    let host = "https://liff.line.me/";
    let id = process.env.LINE_LIFF_ID;
    let typeId;
    switch (type.toLowerCase()) {
      case "compact":
        typeId = process.env.LINE_LIFF_COMPACT_ID;
        break;
      case "full":
        typeId = process.env.LINE_LIFF_FULL_ID;
        break;
      case "tall":
        typeId = process.env.LINE_LIFF_TALL_ID;
        break;
    }

    id = typeId || id;

    const liffurl = `${host}${id}`;
    return path ? `${liffurl}${path}` : liffurl;
  },

  /**
   * 產出整合式連結目錄 bubble（單一 bubble，條列多個連結）。
   * @param {Object} opts
   * @param {String} opts.title 標題
   * @param {String} [opts.subtitle] 副標
   * @param {String} [opts.headerColor] 標題區塊背景色，預設 indigo
   * @param {Array<{icon:string,title:string,subtitle?:string,url:string,theme?:string}>} opts.items
   */
  genLinkMenu: function ({ title, subtitle, headerColor, items }) {
    const header = {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      backgroundColor: headerColor || LINK_THEMES.indigo.solid,
      contents: [
        {
          type: "text",
          text: title,
          color: "#FFFFFF",
          weight: "bold",
          size: "md",
        },
      ],
    };
    if (subtitle) {
      header.contents.push({
        type: "text",
        text: subtitle,
        color: "#FFFFFFCC",
        size: "xxs",
        margin: "xs",
      });
    }

    const bodyContents = [];
    items.forEach((item, idx) => {
      if (idx > 0) {
        bodyContents.push({ type: "separator", color: DIVIDER_COLOR });
      }
      bodyContents.push(buildMenuRow(item));
    });

    return {
      type: "bubble",
      size: "kilo",
      header,
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "none",
        spacing: "none",
        contents: bodyContents,
      },
    };
  },

  /**
   * 產出單一動作卡（micro bubble，頂條 + icon + 標題 + 副標 + CTA）。
   * @param {Object} opts
   * @param {String} opts.icon emoji
   * @param {String} opts.title 標題
   * @param {String} [opts.subtitle] 副標
   * @param {String} opts.url 連結
   * @param {String} [opts.theme] indigo|emerald|amber|rose|cyan|slate
   * @param {String} [opts.cta] 按鈕文字，預設「前往」
   */
  genActionBubble: function ({ icon, title, subtitle, url, theme, cta }) {
    const t = resolveTheme(theme);
    const label = cta || "前往";

    const inner = [
      {
        type: "box",
        layout: "vertical",
        width: "44px",
        height: "44px",
        backgroundColor: t.soft,
        cornerRadius: "12px",
        justifyContent: "center",
        contents: [
          {
            type: "text",
            text: icon,
            align: "center",
            color: t.solid,
            size: "xl",
          },
        ],
      },
      {
        type: "text",
        text: title,
        weight: "bold",
        size: "sm",
        align: "center",
        margin: "md",
      },
    ];

    if (subtitle) {
      inner.push({
        type: "text",
        text: subtitle,
        size: "xxs",
        color: MUTED_TEXT,
        align: "center",
        wrap: true,
        margin: "xs",
      });
    }

    inner.push({
      type: "box",
      layout: "vertical",
      backgroundColor: t.solid,
      cornerRadius: "8px",
      paddingAll: "sm",
      margin: "md",
      contents: [
        {
          type: "text",
          text: label,
          color: "#FFFFFF",
          align: "center",
          size: "xs",
          weight: "bold",
        },
      ],
    });

    return {
      type: "bubble",
      size: "micro",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "none",
        action: { type: "uri", label: title, uri: url },
        contents: [
          {
            type: "box",
            layout: "vertical",
            height: "6px",
            backgroundColor: t.solid,
            contents: [{ type: "filler" }],
          },
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            alignItems: "center",
            contents: inner,
          },
        ],
      },
    };
  },

  /**
   * Generates a rule bubble.
   * @param {string[]} rules
   * @param {string} title
   * @returns
   */
  generateRuleBubble: function (rules, title = "") {
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
                text: title || "系統說明",
              },
              {
                type: "box",
                layout: "vertical",
                contents: ruleBoxes,
                spacing: "lg",
                paddingTop: "md",
              },
            ],
          },
        ],
      },
    };
  },
};

/**
 * Generates a rule text box.
 * @param {string} rule - The rule to be displayed in the text box.
 * @returns {object} - The generated rule text box object.
 */
function generateRuleTextBox(rule) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: "-",
        size: "sm",
        flex: 1,
        align: "center",
      },
      {
        type: "text",
        text: `${rule}`,
        wrap: true,
        size: "sm",
        flex: 10,
      },
    ],
  };
}
