const humanNumber = require("human-number");
const { buildSubPanel, buildLinkPill, COLORS } = require("./_shared");

const formatExp = n => humanNumber(n, v => Number.parseFloat(v).toFixed(1));

function buildDailyCap({ dailyRaw, tier1Upper, tier2Upper }) {
  if (!tier1Upper || !tier2Upper || tier2Upper <= tier1Upper) return null;

  const raw = Math.max(0, Math.floor(dailyRaw || 0));
  const fillPct = Math.max(0, Math.min(100, Math.round((raw / tier2Upper) * 100)));

  let zoneLabel;
  let valueText;
  if (raw < tier1Upper) {
    zoneLabel = "🟢 滿速";
    valueText = `${raw} / ${tier1Upper} · ${zoneLabel}`;
  } else if (raw < tier2Upper) {
    zoneLabel = "🟡 30%";
    valueText = `${raw} / ${tier2Upper} · ${zoneLabel}`;
  } else {
    zoneLabel = "🔴 3% 微量";
    valueText = `${raw} · ${zoneLabel}`;
  }

  const head = {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: "今日經驗區段", size: "xxs", color: "#FFFFFF", flex: 0 },
      {
        type: "text",
        text: valueText,
        size: "xxs",
        color: COLORS.amber300,
        weight: "bold",
        align: "end",
      },
    ],
    margin: "sm",
  };

  const bar = {
    type: "box",
    layout: "horizontal",
    contents:
      fillPct > 0
        ? [
            {
              type: "box",
              layout: "vertical",
              contents: [],
              width: `${fillPct}%`,
              backgroundColor: COLORS.amber400,
              cornerRadius: "md",
            },
          ]
        : [],
    backgroundColor: COLORS.whiteOverlay,
    height: "5px",
    cornerRadius: "md",
    margin: "xs",
  };

  return { head, bar };
}

function buildHero({
  displayName,
  pictureUrl,
  level,
  expRate,
  expCurrent,
  expNext,
  flags,
  dailyRaw,
  tier1Upper,
  tier2Upper,
}) {
  const avatar = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "image",
        url: pictureUrl,
        aspectMode: "cover",
        aspectRatio: "1:1",
        size: "full",
      },
    ],
    cornerRadius: "100px",
    width: "60px",
    height: "60px",
    borderWidth: "2px",
    borderColor: "#FFFFFF",
    flex: 0,
  };

  const levelPill = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: `Lv.${level}`,
        weight: "bold",
        size: "xxs",
        color: COLORS.textDark,
        align: "center",
      },
    ],
    backgroundColor: COLORS.amber400,
    cornerRadius: "xl",
    paddingStart: "sm",
    paddingEnd: "sm",
    paddingTop: "2px",
    paddingBottom: "2px",
    flex: 0,
  };

  const nameRow = {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: displayName,
        weight: "bold",
        size: "md",
        color: "#FFFFFF",
        flex: 1,
        gravity: "center",
      },
      levelPill,
    ],
    spacing: "sm",
    alignItems: "center",
  };

  const flagsList = Array.isArray(flags) ? flags.filter(Boolean) : [];
  const flagRow = flagsList.length
    ? {
        type: "text",
        text: flagsList.join(" · "),
        size: "xxs",
        color: COLORS.amber300,
        weight: "bold",
        margin: "xs",
        wrap: true,
      }
    : null;

  const ident = {
    type: "box",
    layout: "vertical",
    contents: flagRow ? [nameRow, flagRow] : [nameRow],
    flex: 1,
  };

  const topRow = {
    type: "box",
    layout: "horizontal",
    contents: [avatar, ident],
    spacing: "md",
    alignItems: "center",
  };

  const isMax = !expNext && level > 0;
  const expText = isMax ? "MAX" : `${formatExp(expCurrent)} / ${formatExp(expNext)}`;
  const clampedRate = isMax ? 100 : Math.max(0, Math.min(100, expRate || 0));

  const expHead = {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: "EXP", size: "xxs", color: "#FFFFFF", flex: 0 },
      {
        type: "text",
        text: expText,
        size: "xxs",
        color: COLORS.amber300,
        weight: "bold",
        align: "end",
      },
    ],
    margin: "md",
  };

  const expBar = {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [],
        height: "7px",
        backgroundColor: COLORS.amber400,
        width: `${clampedRate}%`,
        cornerRadius: "md",
      },
    ],
    backgroundColor: COLORS.whiteOverlay,
    height: "7px",
    cornerRadius: "md",
    margin: "xs",
  };

  const heroContents = [topRow, expHead, expBar];
  const dailyCap = buildDailyCap({ dailyRaw, tier1Upper, tier2Upper });
  if (dailyCap) heroContents.push(dailyCap.head, dailyCap.bar);

  return {
    type: "box",
    layout: "vertical",
    contents: heroContents,
    paddingAll: "lg",
    background: {
      type: "linearGradient",
      angle: "135deg",
      startColor: COLORS.cyan700,
      endColor: COLORS.cyan600,
    },
    backgroundColor: COLORS.cyan700,
  };
}

function buildSubBadge({ text }) {
  return buildLinkPill({ label: `🎟 訂閱中 · ${text}`, margin: "none" });
}

function buildStat({ fraction, icon, label, tone }) {
  const toneMap = {
    done: { bg: COLORS.greenBg, fg: COLORS.green500, accent: COLORS.green500 },
    miss: { bg: COLORS.redBg, fg: COLORS.red500, accent: COLORS.red500 },
    progress: { bg: COLORS.cyanBg, fg: COLORS.cyan700, accent: COLORS.cyan600 },
  };
  const { bg, fg, accent } = toneMap[tone] || toneMap.progress;

  const leftBar = {
    type: "box",
    layout: "vertical",
    contents: [],
    width: "3px",
    backgroundColor: accent,
  };

  const content = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: icon, size: "sm", color: fg, weight: "bold", flex: 0 },
          { type: "text", text: " ", size: "xxs", flex: 0 },
          { type: "text", text: fraction, size: "sm", color: fg, weight: "bold", flex: 0 },
        ],
      },
      {
        type: "text",
        text: label,
        size: "xxs",
        color: COLORS.textMuted,
        align: "center",
        margin: "xs",
      },
    ],
    backgroundColor: bg,
    paddingAll: "sm",
    flex: 1,
    alignItems: "center",
  };

  return {
    type: "box",
    layout: "horizontal",
    contents: [leftBar, content],
    cornerRadius: "md",
    flex: 1,
  };
}

function buildStatsRow({ gacha, janken, weeklyCompleted }) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      buildStat({
        fraction: `${gacha ? 1 : 0}/1`,
        icon: gacha ? "✓" : "!",
        label: "今日轉蛋",
        tone: gacha ? "done" : "miss",
      }),
      buildStat({
        fraction: `${janken ? 1 : 0}/1`,
        icon: janken ? "✓" : "!",
        label: "今日猜拳",
        tone: janken ? "done" : "miss",
      }),
      buildStat({
        fraction: `${Math.min(weeklyCompleted || 0, 7)}/7`,
        icon: "⋯",
        label: "週任務",
        tone: "progress",
      }),
    ],
    spacing: "sm",
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
  };
}

function buildStreak(signinDays) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: "🔥 連續簽到",
        size: "xs",
        color: COLORS.textMuted,
        flex: 1,
        gravity: "center",
      },
      {
        type: "text",
        contents: [
          {
            type: "span",
            text: `${signinDays || 0}`,
            weight: "bold",
            color: COLORS.amber500,
            size: "md",
          },
          { type: "span", text: " 天", color: COLORS.textMuted, size: "xs" },
        ],
        align: "end",
        flex: 0,
      },
    ],
    backgroundColor: COLORS.amberBg,
    cornerRadius: "md",
    paddingStart: "md",
    paddingEnd: "md",
    paddingTop: "sm",
    paddingBottom: "sm",
    margin: "md",
    alignItems: "center",
  };
}

exports.build = ({
  displayName,
  pictureUrl,
  level,
  expRate,
  expCurrent,
  expNext,
  flags,
  today,
  signinDays,
  subscriptionPanel,
  subscriptionBadge,
  dailyRaw,
  tier1Upper,
  tier2Upper,
  xpHistoryUri,
}) => {
  const bodyContents = [
    buildHero({
      displayName,
      pictureUrl,
      level,
      expRate,
      expCurrent,
      expNext,
      flags,
      dailyRaw,
      tier1Upper,
      tier2Upper,
    }),
  ];

  if (subscriptionPanel) {
    bodyContents.push(buildSubPanel(subscriptionPanel));
  } else if (subscriptionBadge) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      contents: [buildSubBadge(subscriptionBadge)],
      paddingStart: "lg",
      paddingEnd: "lg",
      paddingTop: "md",
    });
  }

  bodyContents.push(buildStatsRow(today));
  bodyContents.push({
    type: "box",
    layout: "vertical",
    contents: [buildStreak(signinDays)],
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingBottom: "md",
  });
  bodyContents.push({
    type: "box",
    layout: "vertical",
    contents: [
      buildLinkPill({
        label: "📈 查看經驗歷程",
        size: "xs",
        cornerRadius: "md",
        alignItems: "center",
        action: { type: "uri", label: "查看經驗歷程", uri: xpHistoryUri },
      }),
    ],
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingBottom: "lg",
  });

  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      contents: bodyContents,
      spacing: "none",
      paddingAll: "none",
    },
  };
};
