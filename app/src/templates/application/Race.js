const config = require("config");
const { getLiffUri } = require("../common");
const { SEMANTIC, HERO_SURFACE, MEDAL, PALETTE } = require("../common/theme");

const raceConfig = config.get("minigame.race");
const trackLength = raceConfig.trackLength;

const STATUS_LABEL = {
  betting: "下注中",
  running: "比賽中",
  finished: "已結束",
};

const STATUS_COLOR = {
  betting: SEMANTIC.warning.main,
  running: SEMANTIC.success.main,
  finished: PALETTE.gray700,
};

const RANK_COLORS = [MEDAL.gold, MEDAL.silver, MEDAL.bronze, PALETTE.gray700, PALETTE.gray700];

const RULES_BUBBLE = generateRulesBubble();

/**
 * Generate race Flex Message carousel
 */
exports.generateRaceCarousel = (races, recentFinished = []) => {
  // Support both single object and array
  const raceList = Array.isArray(races) ? races : [races];
  const allBubbles = [RULES_BUBBLE];

  for (const { raceData, runners, events, odds } of raceList) {
    const rankedRunners = [...runners].sort((a, b) =>
      raceData.status === "betting" ? a.lane - b.lane : b.position - a.position
    );

    // Active races: track (with stamina + odds) + events
    const footer = generateFooter(raceData);
    allBubbles.push(
      generateTrackBubble(raceData, rankedRunners, odds),
      generateEventBubble(raceData, events || [], runners, footer)
    );
  }

  // Append history bubble if there are finished races
  if (recentFinished.length > 0) {
    allBubbles.push(generateHistoryBubble(recentFinished));
  }

  // LINE carousel max 12 bubbles
  const bubbles = allBubbles.slice(0, 12);

  const altStatus = raceList.length > 0 ? STATUS_LABEL[raceList[0].raceData.status] : "歷史戰績";

  return {
    type: "flex",
    altText: `🏆 蘭德索爾盃 - ${altStatus}`,
    contents: {
      type: "carousel",
      contents: bubbles,
    },
  };
};

// ─── Page 1: Race Track ──────────────────────────────────────

function generateTrackBubble(raceData, rankedRunners, odds) {
  const statusLabel = STATUS_LABEL[raceData.status];
  const statusColor = STATUS_COLOR[raceData.status];
  const winner = rankedRunners.find(r => r.position >= trackLength);

  let subtitle;
  if (raceData.status === "betting") {
    const endTime = new Date(raceData.betting_end_at).toLocaleTimeString("zh-TW");
    subtitle = `截止時間: ${endTime}`;
  } else if (raceData.status === "running") {
    subtitle = `第 ${raceData.round} 回合`;
  } else {
    subtitle = `共 ${raceData.round} 回合`;
  }

  // Winner highlight section (only when finished)
  const winnerSection =
    winner && raceData.status === "finished"
      ? [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "image",
                url: winner.avatar_url || "https://i.imgur.com/SGDoCtd.png",
                size: "xs",
                aspectMode: "cover",
                aspectRatio: "1:1",
                flex: 0,
              },
              {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "text",
                    text: "🏆 冠軍",
                    size: "xs",
                    color: MEDAL.gold,
                  },
                  {
                    type: "text",
                    text: winner.character_name,
                    size: "md",
                    color: MEDAL.gold,
                    weight: "bold",
                  },
                ],
                margin: "md",
              },
            ],
            alignItems: "center",
            backgroundColor: HERO_SURFACE.bgRaised,
            cornerRadius: "lg",
            paddingAll: "md",
            margin: "md",
          },
          { type: "separator", color: HERO_SURFACE.divider, margin: "lg" },
        ]
      : [];

  const oddsMap = {};
  if (odds) {
    odds.forEach(o => {
      oddsMap[o.runnerId] = o;
    });
  }

  const isBetting = raceData.status === "betting";
  const trackRows = rankedRunners.map((runner, index) =>
    generateTrackRow(runner, index, oddsMap[runner.id], isBetting)
  );

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: "🏆 蘭德索爾盃",
              weight: "bold",
              size: "lg",
              color: HERO_SURFACE.text,
              flex: 1,
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: statusLabel,
                  size: "xs",
                  color: HERO_SURFACE.text,
                  align: "center",
                },
              ],
              backgroundColor: statusColor,
              cornerRadius: "md",
              paddingAll: "xs",
              width: "60px",
            },
          ],
          alignItems: "center",
        },
        {
          type: "text",
          text: subtitle,
          size: "sm",
          color: HERO_SURFACE.textMuted,
          margin: "sm",
        },
      ],
      backgroundColor: HERO_SURFACE.bg,
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [...winnerSection, ...trackRows],
      backgroundColor: HERO_SURFACE.bgAlt,
      paddingAll: "lg",
      spacing: "md",
    },
  };
}

function generateTrackRow(runner, rankIndex, oddsInfo, isBetting = false) {
  const isWinner = runner.position >= trackLength;
  const isStunned = runner.status === "stunned";
  const isSlowed = runner.status === "slowed";

  const statusIcon = isStunned ? " 💫" : isSlowed ? " 🐌" : "";
  // Betting phase: show character number so users can type .賽跑下注 {number} {amount}
  const rankNum = isBetting ? `${runner.lane}` : `${rankIndex + 1}`;
  const rankBgColor = isBetting ? SEMANTIC.primary.main : RANK_COLORS[rankIndex] || PALETTE.gray700;
  // 金銀銅底色上用深色字，其餘用白字
  const rankTextColor = !isBetting && rankIndex < 3 ? HERO_SURFACE.bg : PALETTE.white;
  const nameColor = isWinner
    ? MEDAL.gold
    : rankIndex < 3
      ? HERO_SURFACE.text
      : HERO_SURFACE.textMuted;
  const barColor = isWinner
    ? MEDAL.gold
    : rankIndex === 0
      ? SEMANTIC.success.light
      : rankIndex < 3
        ? SEMANTIC.primary.light
        : PALETTE.gray500;

  // Right side: odds + stamina
  const rightContents = [];
  if (oddsInfo) {
    rightContents.push({
      type: "text",
      text: `${oddsInfo.odds}x`,
      size: "xs",
      color: MEDAL.gold,
      align: "end",
      gravity: "center",
      flex: 0,
    });
  }
  rightContents.push({
    type: "text",
    text: `⚡${runner.stamina}`,
    size: "xs",
    color: HERO_SURFACE.textMuted,
    align: "end",
    gravity: "center",
    flex: 0,
  });

  return {
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
                text: rankNum,
                size: "xs",
                color: rankTextColor,
                align: "center",
                weight: "bold",
              },
            ],
            width: "20px",
            height: "20px",
            backgroundColor: rankBgColor,
            cornerRadius: "sm",
            justifyContent: "center",
            flex: 0,
          },
          {
            type: "image",
            url: runner.avatar_url || "https://i.imgur.com/SGDoCtd.png",
            size: "xs",
            aspectMode: "cover",
            aspectRatio: "1:1",
            flex: 0,
          },
          {
            type: "text",
            text: `${runner.character_name}${statusIcon}`,
            size: "xs",
            color: nameColor,
            weight: isWinner ? "bold" : "regular",
            flex: 1,
            margin: "sm",
            gravity: "center",
          },
          ...rightContents,
        ],
        alignItems: "center",
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
            backgroundColor: barColor,
            height: "6px",
            cornerRadius: "sm",
            width: `${Math.round((runner.position / trackLength) * 100)}%`,
          },
        ],
        backgroundColor: HERO_SURFACE.bgRaised,
        height: "6px",
        cornerRadius: "sm",
        margin: "md",
      },
    ],
  };
}

// ─── History: Recent Finished Races ──────────────────────────

function generateHistoryBubble(recentFinished) {
  const rows = recentFinished.map((r, i) => {
    const finishedAt = new Date(r.finished_at).toLocaleString("zh-TW", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: `#${i + 1}`,
              size: "xs",
              color: HERO_SURFACE.textMuted,
              align: "center",
            },
          ],
          width: "28px",
          justifyContent: "center",
          flex: 0,
        },
        {
          type: "image",
          url: r.winner_avatar || "https://i.imgur.com/SGDoCtd.png",
          size: "xs",
          aspectMode: "cover",
          aspectRatio: "1:1",
          flex: 0,
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: `🏆 ${r.winner_name}`,
              size: "sm",
              color: i === 0 ? MEDAL.gold : HERO_SURFACE.text,
              weight: i === 0 ? "bold" : "regular",
            },
            {
              type: "text",
              text: `${finishedAt} · ${r.round} 回合`,
              size: "xs",
              color: HERO_SURFACE.textMuted,
              margin: "xs",
            },
          ],
          flex: 1,
          margin: "md",
          justifyContent: "center",
        },
      ],
      alignItems: "center",
      spacing: "sm",
      paddingAll: "sm",
    };
  });

  // Add separators between rows
  const bodyContents = [];
  rows.forEach((row, i) => {
    bodyContents.push(row);
    if (i < rows.length - 1) {
      bodyContents.push({ type: "separator", color: HERO_SURFACE.bgRaised });
    }
  });

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "🏆 歷史戰績",
          weight: "bold",
          size: "lg",
          color: HERO_SURFACE.text,
        },
        {
          type: "text",
          text: `最近 ${recentFinished.length} 場`,
          size: "sm",
          color: HERO_SURFACE.textMuted,
          margin: "sm",
        },
      ],
      backgroundColor: HERO_SURFACE.bg,
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: bodyContents,
      backgroundColor: HERO_SURFACE.bgAlt,
      paddingAll: "md",
      spacing: "none",
    },
  };
}

// ─── Page 2: Event Log ───────────────────────────────────────

function generateEventBubble(raceData, events, runners, footer) {
  const runnerMap = {};
  runners.forEach(r => {
    runnerMap[r.id] = r;
  });

  const recentEvents = events.slice(-8).reverse();

  const rows = recentEvents.map(event => {
    const targetIds =
      typeof event.target_runners === "string"
        ? JSON.parse(event.target_runners)
        : event.target_runners || [];
    const firstTarget = runnerMap[targetIds[0]];

    return {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: `R${event.round}`,
              size: "xs",
              color: MEDAL.gold,
              align: "center",
              weight: "bold",
            },
          ],
          width: "36px",
          justifyContent: "center",
          backgroundColor: HERO_SURFACE.bgRaised,
          cornerRadius: "sm",
          paddingAll: "xs",
          flex: 0,
        },
        ...(firstTarget && firstTarget.avatar_url
          ? [
              {
                type: "image",
                url: firstTarget.avatar_url,
                size: "xs",
                aspectMode: "cover",
                aspectRatio: "1:1",
                flex: 0,
              },
            ]
          : []),
        {
          type: "text",
          text: event.description,
          size: "xs",
          color: HERO_SURFACE.text,
          wrap: true,
          flex: 1,
          margin: "sm",
          gravity: "center",
        },
      ],
      alignItems: "center",
      spacing: "sm",
      paddingBottom: "sm",
      paddingTop: "sm",
    };
  });

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "戰況播報",
          weight: "bold",
          size: "lg",
          color: HERO_SURFACE.text,
        },
        {
          type: "text",
          text: `共 ${events.length} 則事件`,
          size: "sm",
          color: HERO_SURFACE.textMuted,
          margin: "sm",
        },
      ],
      backgroundColor: HERO_SURFACE.bg,
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents:
        rows.length > 0
          ? rows
          : [{ type: "text", text: "尚無事件", color: HERO_SURFACE.textMuted, size: "sm" }],
      backgroundColor: HERO_SURFACE.bgAlt,
      paddingAll: "lg",
      spacing: "none",
    },
    footer,
  };
}

// ─── Rules: Game Explanation ─────────────────────────────────

function generateRulesBubble() {
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "遊戲說明",
          weight: "bold",
          size: "lg",
          color: HERO_SURFACE.text,
        },
        {
          type: "text",
          text: "蘭德索爾盃 玩法介紹",
          size: "sm",
          color: HERO_SURFACE.textMuted,
          margin: "sm",
        },
      ],
      backgroundColor: HERO_SURFACE.bg,
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        ruleSection("基本玩法", [
          "每場比賽 5 位角色參賽",
          "下注期間 4 小時，選角色押注",
          "開跑後每 1 分鐘推進一回合",
          "先到終點的角色獲勝",
        ]),
        { type: "separator", color: HERO_SURFACE.divider, margin: "lg" },
        ruleSection("下注方式", [
          "指令：.賽跑下注 {編號} {金額}",
          "範例：.賽跑下注 1 500",
          "可對多位角色分別下注",
        ]),
        { type: "separator", color: HERO_SURFACE.divider, margin: "lg" },
        ruleSection("獎金計算", [
          "同池分帳制（Parimutuel）",
          "總注額扣除 10% 系統抽成",
          "依押注比例分配給中獎者",
          "若無人押中，全額退還",
        ]),
        { type: "separator", color: HERO_SURFACE.divider, margin: "lg" },
        ruleSection("比賽事件", [
          "絆倒 — 後退 1 格",
          "加速道具 — 前進 2 格",
          "互換位置 — 兩角色交換",
          "大雨 — 全員減速",
          "絆腳索 — 目標暈眩一回合",
        ]),
      ],
      backgroundColor: HERO_SURFACE.bgAlt,
      paddingAll: "lg",
      spacing: "md",
    },
  };
}

function ruleSection(title, items) {
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: title,
        size: "sm",
        color: MEDAL.gold,
        weight: "bold",
        margin: "md",
      },
      ...items.map(item => ({
        type: "text",
        text: `· ${item}`,
        size: "xs",
        color: HERO_SURFACE.text,
        wrap: true,
        margin: "sm",
      })),
    ],
  };
}

// ─── Shared Footer ───────────────────────────────────────────

function generateFooter(raceData) {
  const isBetting = raceData.status === "betting";
  const liffUrl = isBetting ? getLiffUri("tall", "/race/bet") : getLiffUri("full", "/race");

  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "button",
        action: {
          type: "uri",
          label: isBetting ? "🎰 前往下注" : "📱 查看完整資訊",
          uri: liffUrl,
        },
        style: "primary",
        color: isBetting ? SEMANTIC.secondary.main : SEMANTIC.primary.main,
        height: "sm",
      },
    ],
    backgroundColor: HERO_SURFACE.bg,
    paddingAll: "md",
  };
}
