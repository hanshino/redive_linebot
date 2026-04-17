const { getLiffUri } = require("../common");
const { SURFACE, RARITY, FEATURE } = require("../common/theme");

const ACCENT = FEATURE.achievement;

const RARITY_CONFIG = {
  0: { ...RARITY.common, label: "普通" },
  1: { ...RARITY.rare, label: "稀有" },
  2: { ...RARITY.epic, label: "史詩" },
  3: { ...RARITY.legendary, label: "傳說" },
};

exports.generateSummaryFlex = ({ total, unlocked, percentage, recentUnlocks, nearCompletion }) => {
  const contents = [
    generateHeaderSection(unlocked, total, percentage),
    { type: "separator", margin: "lg" },
  ];

  if (recentUnlocks.length > 0) {
    contents.push(generateRecentSection(recentUnlocks));
    contents.push({ type: "separator", margin: "lg" });
  }

  if (nearCompletion.length > 0) {
    contents.push(generateNearCompletionSection(nearCompletion));
    contents.push({ type: "separator", margin: "lg" });
  }

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "成就系統", weight: "bold", size: "xl", color: ACCENT.contrast },
      ],
      backgroundColor: ACCENT.main,
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents,
      spacing: "lg",
      paddingAll: "lg",
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "查看所有成就 →",
            uri: getLiffUri("full", "/achievements"),
          },
          style: "primary",
          color: ACCENT.main,
        },
      ],
    },
  };
};

function generateHeaderSection(unlocked, total, percentage) {
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: `${unlocked} / ${total}`,
        size: "xxl",
        weight: "bold",
        align: "center",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "vertical",
            contents: [{ type: "filler" }],
            width: `${percentage}%`,
            backgroundColor: ACCENT.main,
            height: "6px",
            cornerRadius: "3px",
          },
        ],
        backgroundColor: SURFACE.bgMuted,
        height: "6px",
        cornerRadius: "3px",
        margin: "md",
      },
      {
        type: "text",
        text: `${percentage}% 完成`,
        size: "xs",
        color: SURFACE.textMuted,
        align: "center",
        margin: "sm",
      },
    ],
  };
}

function generateRecentSection(recentUnlocks) {
  const items = recentUnlocks.map(achievement => {
    const rarity = RARITY_CONFIG[achievement.rarity] || RARITY_CONFIG[0];
    const timeAgo = getTimeAgo(achievement.unlocked_at);

    return {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: achievement.icon, flex: 1, align: "center", gravity: "center" },
        {
          type: "box",
          layout: "vertical",
          flex: 6,
          contents: [
            { type: "text", text: achievement.name, size: "sm", weight: "bold" },
            { type: "text", text: timeAgo, size: "xxs", color: SURFACE.textMuted },
          ],
        },
        {
          type: "text",
          text: `★ ${rarity.label}`,
          size: "xxs",
          color: rarity.main,
          flex: 2,
          align: "end",
          gravity: "center",
        },
      ],
      spacing: "sm",
    };
  });

  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "最近解鎖",
        size: "xs",
        color: SURFACE.textMuted,
        weight: "bold",
        margin: "md",
      },
      ...items,
    ],
    spacing: "md",
  };
}

function generateNearCompletionSection(nearCompletion) {
  const items = nearCompletion.map(achievement => {
    const pct = Math.min(
      Math.round((achievement.current_value / achievement.target_value) * 100),
      99
    );

    return {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: achievement.icon, flex: 1, align: "center", gravity: "center" },
        {
          type: "box",
          layout: "vertical",
          flex: 7,
          contents: [
            { type: "text", text: achievement.name, size: "sm" },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  contents: [{ type: "filler" }],
                  width: `${pct}%`,
                  backgroundColor: ACCENT.light,
                  height: "4px",
                  cornerRadius: "2px",
                },
              ],
              backgroundColor: SURFACE.bgMuted,
              height: "4px",
              cornerRadius: "2px",
              margin: "sm",
            },
          ],
        },
        {
          type: "text",
          text: `${pct}%`,
          size: "xxs",
          color: SURFACE.textMuted,
          flex: 1,
          align: "end",
          gravity: "center",
        },
      ],
      spacing: "sm",
    };
  });

  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "即將達成",
        size: "xs",
        color: SURFACE.textMuted,
        weight: "bold",
        margin: "md",
      },
      ...items,
    ],
    spacing: "md",
  };
}

exports.generateTitlesFlex = titles => {
  const rows = titles.map(title => {
    const rarity = RARITY_CONFIG[title.rarity] || RARITY_CONFIG[0];
    return {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: title.icon, flex: 1, align: "center", gravity: "center" },
        { type: "text", text: title.name, size: "sm", flex: 5, gravity: "center" },
        {
          type: "text",
          text: rarity.label,
          size: "xxs",
          color: rarity.main,
          flex: 2,
          align: "end",
          gravity: "center",
        },
      ],
      backgroundColor: rarity.bg,
      paddingAll: "sm",
      cornerRadius: "md",
    };
  });

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "我的稱號", weight: "bold", size: "lg", color: ACCENT.contrast },
      ],
      backgroundColor: ACCENT.main,
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: rows,
      spacing: "sm",
      paddingAll: "lg",
    },
  };
};

exports.generateNoDataText = () => "還沒有任何成就，快去探索各種功能吧！";
exports.generateNoTitlesText = () => "目前沒有持有任何稱號";

function getTimeAgo(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 週前`;
  return `${Math.floor(days / 30)} 月前`;
}
