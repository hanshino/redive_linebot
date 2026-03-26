const config = require("config");
const { getLiffUri } = require("../common");

const raceConfig = config.get("minigame.race");
const trackLength = raceConfig.trackLength;

const STATUS_LABEL = {
  betting: "下注中",
  running: "比賽中",
  finished: "已結束",
};

const STATUS_COLOR = {
  betting: "#FF9800",
  running: "#4CAF50",
  finished: "#9E9E9E",
};

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32", "#555555", "#555555"];

/**
 * Generate race Flex Message carousel
 */
exports.generateRaceCarousel = races => {
  // Support both single object and array
  const raceList = Array.isArray(races) ? races : [races];
  const allBubbles = [];

  for (const { raceData, runners, events, odds } of raceList) {
    const rankedRunners = [...runners].sort((a, b) => b.position - a.position);

    if (raceData.status === "finished") {
      // Finished races: compact summary only
      allBubbles.push(generateResultSummaryBubble(raceData, rankedRunners));
    } else {
      // Active races: full detail
      const footer = generateFooter(raceData);
      allBubbles.push(
        generateTrackBubble(raceData, rankedRunners),
        generateDetailBubble(raceData, runners, odds),
        generateEventBubble(raceData, events || [], runners, footer)
      );
    }
  }

  // LINE carousel max 12 bubbles
  const bubbles = allBubbles.slice(0, 12);
  const firstRace = raceList[0].raceData;

  return {
    type: "flex",
    altText: `🏇 賽馬競技場 - ${STATUS_LABEL[firstRace.status]}`,
    contents: {
      type: "carousel",
      contents: bubbles,
    },
  };
};

// ─── Page 1: Race Track ──────────────────────────────────────

function generateTrackBubble(raceData, rankedRunners) {
  const statusLabel = STATUS_LABEL[raceData.status];
  const statusColor = STATUS_COLOR[raceData.status];
  const winner = rankedRunners.find(r => r.position >= trackLength);

  let subtitle = "";
  if (raceData.status === "betting") {
    const endTime = new Date(raceData.betting_end_at).toLocaleTimeString("zh-TW");
    subtitle = `截止時間: ${endTime}`;
  } else if (raceData.status === "running") {
    subtitle = `第 ${raceData.round} 回合`;
  } else if (winner) {
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
                    size: "xxs",
                    color: "#FFD700",
                  },
                  {
                    type: "text",
                    text: winner.character_name,
                    size: "md",
                    color: "#FFD700",
                    weight: "bold",
                  },
                ],
                margin: "md",
              },
            ],
            alignItems: "center",
            backgroundColor: "#2a2a4a",
            cornerRadius: "lg",
            paddingAll: "md",
            margin: "md",
          },
          { type: "separator", color: "#333333", margin: "lg" },
        ]
      : [];

  const trackRows = rankedRunners.map((runner, index) => generateTrackRow(runner, index));

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
              text: "🏇 賽馬競技場",
              weight: "bold",
              size: "lg",
              color: "#FFFFFF",
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
                  color: "#FFFFFF",
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
          color: "#B0B0B0",
          margin: "sm",
        },
      ],
      backgroundColor: "#1a1a2e",
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [...winnerSection, ...trackRows],
      backgroundColor: "#16213e",
      paddingAll: "lg",
      spacing: "md",
    },
  };
}

function generateTrackRow(runner, rankIndex) {
  const isWinner = runner.position >= trackLength;
  const isStunned = runner.status === "stunned";
  const isSlowed = runner.status === "slowed";

  const filledFlex = Math.max(runner.position, 0);
  const remainingFlex = Math.max(trackLength - runner.position, 0);

  const statusIcon = isStunned ? " 💫" : isSlowed ? " 🐌" : "";
  const rankNum = `${rankIndex + 1}`;
  const rankBgColor = RANK_COLORS[rankIndex] || "#555555";
  const nameColor = isWinner ? "#FFD700" : rankIndex < 3 ? "#FFFFFF" : "#999999";
  const barColor = isWinner
    ? "#FFD700"
    : rankIndex === 0
      ? "#4CAF50"
      : rankIndex < 3
        ? "#2196F3"
        : "#666666";

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
                size: "xxs",
                color: "#FFFFFF",
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
            size: "xxs",
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
          {
            type: "text",
            text: `${runner.position}/${trackLength}`,
            size: "xxs",
            color: "#B0B0B0",
            align: "end",
            gravity: "center",
          },
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
        backgroundColor: "#333333",
        height: "6px",
        cornerRadius: "sm",
        margin: "md",
      },
    ],
  };
}

// ─── Compact: Finished Race Summary ──────────────────────────

function generateResultSummaryBubble(raceData, rankedRunners) {
  const winner = rankedRunners[0];
  const top3 = rankedRunners.slice(0, 3);
  const finishedAt = new Date(raceData.finished_at).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const podiumRows = top3.map((runner, i) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${i + 1}`,
            size: "xxs",
            color: "#FFFFFF",
            align: "center",
            weight: "bold",
          },
        ],
        width: "20px",
        height: "20px",
        backgroundColor: RANK_COLORS[i],
        cornerRadius: "sm",
        justifyContent: "center",
        flex: 0,
      },
      {
        type: "image",
        url: runner.avatar_url || "https://i.imgur.com/SGDoCtd.png",
        size: "xxs",
        aspectMode: "cover",
        aspectRatio: "1:1",
        flex: 0,
      },
      {
        type: "text",
        text: runner.character_name,
        size: "sm",
        color: i === 0 ? "#FFD700" : "#FFFFFF",
        weight: i === 0 ? "bold" : "regular",
        flex: 1,
        margin: "sm",
        gravity: "center",
      },
    ],
    alignItems: "center",
    spacing: "sm",
  }));

  const liffUrl = getLiffUri("full", "/race");

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
              text: "🏁 上場結果",
              weight: "bold",
              size: "lg",
              color: "#FFFFFF",
              flex: 1,
            },
            {
              type: "text",
              text: finishedAt,
              size: "xs",
              color: "#B0B0B0",
              align: "end",
              gravity: "center",
            },
          ],
          alignItems: "center",
        },
      ],
      backgroundColor: "#1a1a2e",
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: podiumRows,
      backgroundColor: "#16213e",
      paddingAll: "lg",
      spacing: "md",
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "查看完整賽況",
            uri: liffUrl,
          },
          style: "primary",
          color: "#3B82F6",
          height: "sm",
        },
      ],
      backgroundColor: "#1a1a2e",
      paddingAll: "md",
    },
  };
}

// ─── Page 2: Character Details + Odds ────────────────────────

function generateDetailBubble(raceData, runners, odds) {
  const oddsMap = {};
  if (odds) {
    odds.forEach(o => {
      oddsMap[o.runnerId] = o;
    });
  }

  const rows = runners.map((runner, index) => {
    const staminaPercent = runner.stamina / 100;
    const staminaColor =
      staminaPercent > 0.6 ? "#4CAF50" : staminaPercent > 0.3 ? "#FF9800" : "#F44336";
    const staminaFlex = Math.max(Math.round(staminaPercent * 10), 1);
    const staminaRemaining = Math.max(10 - staminaFlex, 0);

    const statusText =
      runner.status === "stunned" ? "💫 暈眩" : runner.status === "slowed" ? "🐌 減速" : "";

    const oddsInfo = oddsMap[runner.id];
    const oddsText = oddsInfo ? `${oddsInfo.odds}x` : "-";

    return {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "image",
          url: runner.avatar_url || "https://i.imgur.com/SGDoCtd.png",
          size: "xxs",
          aspectMode: "cover",
          aspectRatio: "1:1",
          flex: 0,
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
                  type: "text",
                  text: runner.character_name + (statusText ? ` ${statusText}` : ""),
                  size: "xs",
                  color: "#FFFFFF",
                  weight: "bold",
                  flex: 1,
                },
                {
                  type: "text",
                  text: oddsText,
                  size: "xs",
                  color: "#FFD700",
                  align: "end",
                },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: `體力`,
                  size: "xxs",
                  color: "#888888",
                  flex: 0,
                  gravity: "center",
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "box",
                      layout: "vertical",
                      contents: [],
                      backgroundColor: staminaColor,
                      height: "4px",
                      cornerRadius: "sm",
                      flex: staminaFlex,
                    },
                    ...(staminaRemaining > 0
                      ? [
                          {
                            type: "box",
                            layout: "vertical",
                            contents: [],
                            backgroundColor: "#333333",
                            height: "4px",
                            cornerRadius: "sm",
                            flex: staminaRemaining,
                          },
                        ]
                      : []),
                  ],
                  flex: 1,
                  margin: "sm",
                  spacing: "xs",
                },
                {
                  type: "text",
                  text: `${runner.stamina}`,
                  size: "xxs",
                  color: "#888888",
                  flex: 0,
                  margin: "sm",
                },
              ],
              margin: "sm",
              alignItems: "center",
            },
          ],
          flex: 1,
          margin: "sm",
        },
      ],
      alignItems: "center",
      spacing: "sm",
    };
  });

  // Subtitle based on status
  let subtitleText = "即時體力與賠率";
  if (raceData.status === "betting") {
    subtitleText = "選擇你看好的角色下注！";
  }

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "角色詳情",
          weight: "bold",
          size: "lg",
          color: "#FFFFFF",
        },
        {
          type: "text",
          text: subtitleText,
          size: "sm",
          color: "#B0B0B0",
          margin: "sm",
        },
      ],
      backgroundColor: "#1a1a2e",
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: rows,
      backgroundColor: "#16213e",
      paddingAll: "lg",
      spacing: "lg",
    },
  };
}

// ─── Page 3: Event Log ───────────────────────────────────────

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
              size: "xxs",
              color: "#FFD700",
              align: "center",
              weight: "bold",
            },
          ],
          width: "28px",
          justifyContent: "center",
          backgroundColor: "#2a2a4a",
          cornerRadius: "sm",
          paddingAll: "xs",
        },
        ...(firstTarget && firstTarget.avatar_url
          ? [
              {
                type: "image",
                url: firstTarget.avatar_url,
                size: "xxs",
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
          color: "#FFFFFF",
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
          color: "#FFFFFF",
        },
        {
          type: "text",
          text: `共 ${events.length} 則事件`,
          size: "sm",
          color: "#B0B0B0",
          margin: "sm",
        },
      ],
      backgroundColor: "#1a1a2e",
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents:
        rows.length > 0 ? rows : [{ type: "text", text: "尚無事件", color: "#B0B0B0", size: "sm" }],
      backgroundColor: "#16213e",
      paddingAll: "lg",
      spacing: "none",
    },
    footer,
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
        color: isBetting ? "#E67E22" : "#3B82F6",
        height: "sm",
      },
    ],
    backgroundColor: "#1a1a2e",
    paddingAll: "md",
  };
}
