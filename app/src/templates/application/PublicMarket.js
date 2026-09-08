const { getLiffUri } = require("../common");

/**
 * 公開市場總覽 bubble（`.市場`）。
 * 版型來自設計稿 line-flex-market.json，數字改為由 service 帶入。
 *
 * @param {Object} param0
 * @param {Number} param0.myOpenCount 我的開放掛單數（賣單 + 收購單合計）
 * @param {Number} param0.maxOpen 掛單上限（兩種方向共用）
 * @param {Number} param0.totalOpenCount 全站開放掛單數
 * @param {Number} param0.feePercent 手續費百分比
 * @returns {Object} Flex bubble
 */
exports.generateMarketBubble = ({ myOpenCount, maxOpen, totalOpenCount, feePercent }) => {
  // 配額條寬度：0 也給 0%，滿了就 100%，避免超出容器。
  const quotaRatio = maxOpen > 0 ? Math.min(myOpenCount / maxOpen, 1) : 0;
  const quotaWidth = `${Math.round(quotaRatio * 100)}%`;

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      paddingBottom: "16px",
      background: {
        type: "linearGradient",
        angle: "135deg",
        startColor: "#00838F",
        endColor: "#00ACC1",
      },
      contents: [
        {
          type: "box",
          layout: "baseline",
          contents: [
            {
              type: "text",
              text: "公開市場",
              size: "xl",
              weight: "bold",
              color: "#FFFFFF",
              flex: 0,
            },
            {
              type: "text",
              text: `手續費 ${feePercent}%`,
              size: "xs",
              color: "#FFFFFF",
              align: "end",
              gravity: "center",
            },
          ],
        },
        {
          type: "text",
          text: "角色 · 角色碎片 ｜ 賣單最低價 · 收購單最高價",
          size: "xs",
          color: "#CDEFF3",
          margin: "sm",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "baseline",
          contents: [
            {
              type: "text",
              text: "我的開放委託",
              size: "sm",
              color: "#5A6B7F",
              flex: 0,
            },
            {
              type: "text",
              text: `${myOpenCount} / ${maxOpen}`,
              size: "md",
              weight: "bold",
              color: "#1A2332",
              align: "end",
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          height: "6px",
          backgroundColor: "#E0F7FA",
          cornerRadius: "3px",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: quotaWidth,
              height: "6px",
              backgroundColor: "#00ACC1",
              cornerRadius: "3px",
              contents: [{ type: "filler" }],
            },
          ],
        },
        {
          type: "text",
          text: "賣單 + 收購單合計",
          size: "xxs",
          color: "#5A6B7F",
          margin: "sm",
        },
        {
          type: "separator",
          margin: "lg",
          color: "#E8EEF0",
        },
        {
          type: "box",
          layout: "baseline",
          margin: "lg",
          contents: [
            {
              type: "text",
              text: "全站開放委託",
              size: "sm",
              color: "#5A6B7F",
              flex: 0,
            },
            {
              type: "text",
              text: `${totalOpenCount} 筆`,
              size: "sm",
              weight: "bold",
              color: "#1A2332",
              align: "end",
            },
          ],
        },
        {
          type: "box",
          layout: "baseline",
          margin: "sm",
          contents: [
            {
              type: "text",
              text: "手續費",
              size: "sm",
              color: "#5A6B7F",
              flex: 0,
            },
            {
              type: "text",
              text: `成交總額 ${feePercent}%（向上取整，銷毀）`,
              size: "xs",
              color: "#5A6B7F",
              align: "end",
              wrap: true,
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "lg",
          spacing: "sm",
          paddingAll: "12px",
          backgroundColor: "#FFF7E6",
          cornerRadius: "8px",
          borderWidth: "1px",
          borderColor: "#FBBF24",
          contents: [
            {
              type: "text",
              text: "⚠",
              size: "sm",
              color: "#B45309",
              flex: 0,
            },
            {
              type: "text",
              text: "賣角色時你的升星強化不會轉移，買家收到的是角色初始星數。賣碎片不會動到角色本體，收集率不受影響。",
              size: "xs",
              color: "#B45309",
              wrap: true,
            },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      paddingTop: "none",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: "#00ACC1",
          action: {
            type: "uri",
            label: "角色市場",
            uri: getLiffUri("full", "/trade/market"),
          },
        },
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: "#26A69A",
          action: {
            type: "uri",
            label: "碎片市場",
            uri: getLiffUri("full", "/trade/market?itemKind=fragment"),
          },
        },
        {
          type: "button",
          style: "link",
          height: "sm",
          action: {
            type: "uri",
            label: "我要掛賣單",
            uri: getLiffUri("full", "/trade/sell"),
          },
        },
        {
          type: "button",
          style: "link",
          height: "sm",
          action: {
            type: "uri",
            label: "我要發收購單",
            uri: getLiffUri("full", "/trade/buy"),
          },
        },
      ],
    },
    styles: {
      footer: {
        separator: false,
      },
    },
  };
};
