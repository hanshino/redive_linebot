const JankenRating = require("../../model/application/JankenRating");
const { getLiffUri } = require("../common");
const { SEMANTIC, HERO_SURFACE } = require("../common/theme");

const ASSET_VERSION = Date.now();
const jankenAsset = (baseUrl, name) => `${baseUrl}/bot-assets/janken/${name}?v=${ASSET_VERSION}`;

const genAction = function (type, { uuid, p1Uid, p2Uid, betAmount }) {
  return {
    type: "postback",
    label: type,
    data: JSON.stringify({
      action: "janken",
      type,
      uuid,
      userId: p1Uid,
      targetUserId: p2Uid,
      betAmount: betAmount || 0,
    }),
  };
};

const genChallengeAction = function (type, { userId, groupId }) {
  return {
    type: "postback",
    label: type,
    data: JSON.stringify({
      action: "challenge",
      type,
      userId,
      groupId,
    }),
  };
};

/**
 * Duel start card — shown to P1 to pick their hand
 * @param {Object} param0
 * @param {String} param0.p1IconUrl
 * @param {String} param0.p2IconUrl
 * @param {String} param0.p1Uid
 * @param {String} param0.p2Uid
 * @param {String} param0.uuid
 * @param {Number} param0.betAmount
 * @param {String} param0.title
 * @param {String} param0.baseUrl
 * @returns {Object} LINE Flex Message bubble
 */
exports.generateDuelCard = ({
  p1IconUrl,
  p2IconUrl,
  p1Uid,
  p2Uid,
  uuid,
  betAmount = 0,
  title = "",
  baseUrl,
}) => {
  const actionParams = { uuid, p1Uid, p2Uid, betAmount };

  const handButtons = {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: jankenAsset(baseUrl, "rock.png"),
            size: "80px",
            aspectMode: "fit",
          },
        ],
        paddingAll: "md",
        backgroundColor: HERO_SURFACE.bgRaised,
        cornerRadius: "lg",
        flex: 1,
        action: genAction("rock", actionParams),
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: jankenAsset(baseUrl, "scissors.png"),
            size: "80px",
            aspectMode: "fit",
          },
        ],
        paddingAll: "md",
        backgroundColor: HERO_SURFACE.bgRaised,
        cornerRadius: "lg",
        flex: 1,
        action: genAction("scissors", actionParams),
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: jankenAsset(baseUrl, "paper.png"),
            size: "80px",
            aspectMode: "fit",
          },
        ],
        paddingAll: "md",
        backgroundColor: HERO_SURFACE.bgRaised,
        cornerRadius: "lg",
        flex: 1,
        action: genAction("paper", actionParams),
      },
    ],
    spacing: "md",
  };

  const randomButton = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        align: "center",
        text: "交給命運",
        color: HERO_SURFACE.text,
        weight: "bold",
      },
    ],
    paddingAll: "lg",
    margin: "md",
    cornerRadius: "md",
    backgroundColor: HERO_SURFACE.bgButton,
    action: genAction("random", actionParams),
  };

  const avatarRow = {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: p1IconUrl,
            aspectMode: "cover",
            aspectRatio: "1:1",
          },
        ],
        cornerRadius: "100px",
        flex: 1,
      },
      {
        type: "image",
        url: jankenAsset(baseUrl, "vs.png"),
        size: "60px",
        aspectMode: "fit",
        flex: 0,
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: p2IconUrl,
            aspectMode: "cover",
            aspectRatio: "1:1",
          },
        ],
        cornerRadius: "100px",
        flex: 1,
      },
    ],
    spacing: "md",
    alignItems: "center",
  };

  const bodyContents = [avatarRow];

  if (betAmount > 0) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: `賭注：${betAmount} 女神石`,
          align: "center",
          color: HERO_SURFACE.textAccent,
          weight: "bold",
        },
      ],
      margin: "md",
    });
  }

  bodyContents.push(handButtons);
  bodyContents.push(randomButton);

  if (!betAmount) {
    bodyContents.push({
      type: "text",
      text: "試試 /決鬥 @對手 金額 來下注對決！",
      align: "center",
      color: HERO_SURFACE.textMuted,
      size: "xxs",
      margin: "md",
    });
  }

  const bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: HERO_SURFACE.bg,
      contents: bodyContents,
      paddingAll: "lg",
      spacing: "lg",
    },
  };

  if (title) {
    bubble.header = {
      type: "box",
      layout: "vertical",
      backgroundColor: HERO_SURFACE.bg,
      contents: [
        {
          type: "text",
          text: title,
          align: "center",
          weight: "bold",
          color: HERO_SURFACE.text,
          size: "lg",
        },
      ],
      paddingAll: "lg",
    };
  }

  return bubble;
};

/**
 * Arena holder card — shown to challengers to pick their hand
 * @param {Object} param0
 * @param {String} param0.userId
 * @param {String} param0.groupId
 * @param {String} param0.iconUrl
 * @param {String} param0.title
 * @param {String} param0.baseUrl
 * @returns {Object} LINE Flex Message bubble
 */
exports.generateArenaCard = ({ userId, groupId, iconUrl, title = "", baseUrl }) => {
  const challengeParams = { userId, groupId };

  const handButtons = {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: jankenAsset(baseUrl, "rock.png"),
            size: "80px",
            aspectMode: "fit",
          },
        ],
        paddingAll: "md",
        backgroundColor: HERO_SURFACE.bgRaised,
        cornerRadius: "lg",
        flex: 1,
        action: genChallengeAction("rock", challengeParams),
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: jankenAsset(baseUrl, "scissors.png"),
            size: "80px",
            aspectMode: "fit",
          },
        ],
        paddingAll: "md",
        backgroundColor: HERO_SURFACE.bgRaised,
        cornerRadius: "lg",
        flex: 1,
        action: genChallengeAction("scissors", challengeParams),
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: jankenAsset(baseUrl, "paper.png"),
            size: "80px",
            aspectMode: "fit",
          },
        ],
        paddingAll: "md",
        backgroundColor: HERO_SURFACE.bgRaised,
        cornerRadius: "lg",
        flex: 1,
        action: genChallengeAction("paper", challengeParams),
      },
    ],
    spacing: "md",
  };

  const randomButton = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        align: "center",
        text: "交給命運",
        color: HERO_SURFACE.text,
        weight: "bold",
      },
    ],
    paddingAll: "lg",
    margin: "md",
    cornerRadius: "md",
    backgroundColor: HERO_SURFACE.bgButton,
    action: genChallengeAction("random", challengeParams),
  };

  const bodyContents = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "filler" },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "image",
              url: iconUrl,
              aspectMode: "cover",
              aspectRatio: "1:1",
            },
          ],
          cornerRadius: "100px",
          flex: 1,
        },
        { type: "filler" },
      ],
      spacing: "md",
    },
    handButtons,
    randomButton,
  ];

  const bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: HERO_SURFACE.bg,
      contents: bodyContents,
      paddingAll: "lg",
      spacing: "lg",
    },
  };

  if (title) {
    bubble.header = {
      type: "box",
      layout: "vertical",
      backgroundColor: HERO_SURFACE.bg,
      contents: [
        {
          type: "text",
          text: title,
          align: "center",
          weight: "bold",
          color: HERO_SURFACE.text,
          size: "lg",
        },
      ],
      paddingAll: "lg",
    };
  }

  return bubble;
};

/**
 * Result card shown after a janken match
 * @param {Object} param0
 * @param {String} param0.p1Name
 * @param {String} param0.p2Name
 * @param {String} param0.p1Choice  "rock" | "scissors" | "paper"
 * @param {String} param0.p2Choice  "rock" | "scissors" | "paper"
 * @param {String} param0.resultType "win" | "lose" | "draw"
 * @param {String} param0.winnerName
 * @param {Number} param0.betAmount
 * @param {Number} param0.betWinAmount
 * @param {String} param0.baseUrl
 * @returns {Object} LINE Flex Message bubble
 */
exports.generateResultCard = ({
  p1Name,
  p2Name,
  p1Choice,
  p2Choice,
  resultType,
  winnerName,
  betAmount = 0,
  betWinAmount = 0,
  baseUrl,
  winnerStreak = 0,
  p1EloChange,
  p2EloChange,
  p1NewElo,
  p2NewElo,
}) => {
  const resultColorMap = {
    win: HERO_SURFACE.textAccent,
    lose: HERO_SURFACE.textMuted,
    draw: SEMANTIC.primary.light,
  };

  const p1Image = jankenAsset(baseUrl, `${p1Choice}.png`);
  const p2Image = jankenAsset(baseUrl, `${p2Choice}.png`);
  const winImage = jankenAsset(baseUrl, "win.png");
  const loseImage = jankenAsset(baseUrl, "lose.png");
  const drawImage = jankenAsset(baseUrl, "draw.png");
  const resultColor = resultColorMap[resultType] || HERO_SURFACE.text;

  const winnerText = resultType === "draw" ? "平手！" : `${winnerName} 贏了！`;

  // Determine which badge goes above each player
  // p1 is the initiator; resultType is from p1's perspective
  let p1Badge, p2Badge;
  if (resultType === "draw") {
    p1Badge = drawImage;
    p2Badge = drawImage;
  } else if (resultType === "win") {
    p1Badge = winImage;
    p2Badge = loseImage;
  } else {
    p1Badge = loseImage;
    p2Badge = winImage;
  }

  const bodyContents = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "image",
              url: p1Badge,
              size: "60px",
              aspectMode: "fit",
            },
            {
              type: "text",
              text: p1Name,
              align: "center",
              color: HERO_SURFACE.text,
              size: "sm",
              weight: "bold",
            },
            {
              type: "image",
              url: p1Image,
              size: "80px",
              aspectMode: "fit",
            },
            ...(p1NewElo != null
              ? [
                  {
                    type: "image",
                    url: jankenAsset(baseUrl, `${JankenRating.getRankImageKey(p1NewElo)}.png`),
                    size: "30px",
                    aspectMode: "fit",
                  },
                  {
                    type: "text",
                    text: JankenRating.getRankLabel(p1NewElo),
                    align: "center",
                    color: HERO_SURFACE.textMuted,
                    size: "xxs",
                  },
                ]
              : []),
          ],
          flex: 1,
          alignItems: "center",
          spacing: "sm",
        },
        {
          type: "text",
          text: "VS",
          align: "center",
          color: HERO_SURFACE.text,
          weight: "bold",
          size: "lg",
          flex: 0,
          gravity: "center",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "image",
              url: p2Badge,
              size: "60px",
              aspectMode: "fit",
            },
            {
              type: "text",
              text: p2Name,
              align: "center",
              color: HERO_SURFACE.text,
              size: "sm",
              weight: "bold",
            },
            {
              type: "image",
              url: p2Image,
              size: "80px",
              aspectMode: "fit",
            },
            ...(p2NewElo != null
              ? [
                  {
                    type: "image",
                    url: jankenAsset(baseUrl, `${JankenRating.getRankImageKey(p2NewElo)}.png`),
                    size: "30px",
                    aspectMode: "fit",
                  },
                  {
                    type: "text",
                    text: JankenRating.getRankLabel(p2NewElo),
                    align: "center",
                    color: HERO_SURFACE.textMuted,
                    size: "xxs",
                  },
                ]
              : []),
          ],
          flex: 1,
          alignItems: "center",
          spacing: "sm",
        },
      ],
      spacing: "md",
      alignItems: "center",
    },
    {
      type: "text",
      text: winnerText,
      align: "center",
      color: resultColor,
      weight: "bold",
      size: "xl",
      margin: "lg",
    },
  ];

  if (betAmount > 0) {
    const betText =
      resultType === "draw" ? "賭注已退回雙方" : `${winnerName} 贏得了 ${betWinAmount} 女神石！`;

    bodyContents.push({
      type: "text",
      text: betText,
      align: "center",
      color: HERO_SURFACE.textAccent,
      size: "sm",
      margin: "md",
    });
  }

  if (winnerStreak >= 2) {
    bodyContents.push({
      type: "text",
      text: `${winnerName} ${winnerStreak} 連勝中！`,
      align: "center",
      color: SEMANTIC.warning.main,
      size: "sm",
      weight: "bold",
      margin: "md",
    });
  }

  if (p1NewElo != null) {
    const p1Sign = p1EloChange >= 0 ? "+" : "";
    const p2Sign = p2EloChange >= 0 ? "+" : "";
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: `${p1Name}: ${p1Sign}${p1EloChange}`,
          align: "center",
          color: p1EloChange >= 0 ? SEMANTIC.success.main : SEMANTIC.danger.main,
          size: "xs",
          flex: 1,
        },
        {
          type: "text",
          text: `${p2Name}: ${p2Sign}${p2EloChange}`,
          align: "center",
          color: p2EloChange >= 0 ? SEMANTIC.success.main : SEMANTIC.danger.main,
          size: "xs",
          flex: 1,
        },
      ],
      margin: "md",
    });
  }

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: HERO_SURFACE.bg,
      contents: bodyContents,
      paddingAll: "lg",
      spacing: "lg",
    },
    footer: {
      type: "box",
      layout: "vertical",
      backgroundColor: HERO_SURFACE.bg,
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "查看競技場排行",
            uri: getLiffUri("full", "/janken"),
          },
          style: "link",
          color: SEMANTIC.primary.light,
          height: "sm",
        },
      ],
      paddingAll: "sm",
    },
  };
};

/**
 * Janken stats bubble showing win/lose/draw counts and win rate
 * Moved from Minigame.js — exact same implementation
 * @param {Object} param0
 * @param {Number} param0.winCount
 * @param {Number} param0.loseCount
 * @param {Number} param0.drawCount
 * @param {Number} param0.rate
 * @returns {Object} LINE Flex Message bubble
 */
exports.generateJankenGrade = ({ winCount = 0, loseCount = 0, drawCount = 0, rate = 0 }) => {
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "猜拳戰績",
          align: "center",
          weight: "bold",
        },
      ],
      paddingBottom: "none",
    },
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
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: `${winCount}`,
                    },
                    {
                      type: "span",
                      text: "勝",
                    },
                  ],
                  align: "center",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: `${loseCount}`,
                    },
                    {
                      type: "span",
                      text: "敗",
                    },
                  ],
                  align: "center",
                },
                {
                  type: "text",
                  contents: [
                    {
                      type: "span",
                      text: `${drawCount}`,
                    },
                    {
                      type: "span",
                      text: "平手",
                    },
                  ],
                  align: "center",
                },
              ],
              spacing: "sm",
            },
            {
              type: "text",
              contents: [
                {
                  type: "span",
                  text: "勝率",
                },
                {
                  type: "span",
                  text: "：",
                },
                {
                  type: "span",
                  text: `${rate}%`,
                },
              ],
              align: "center",
            },
          ],
          paddingAll: "sm",
          spacing: "md",
        },
      ],
    },
  };
};

exports.generateRankCard = ({
  rankLabel,
  rankImageKey,
  elo,
  winCount,
  loseCount,
  drawCount,
  winRate,
  streak,
  maxStreak,
  bounty,
  eloToNext,
  serverRank,
  maxBet,
  baseUrl,
}) => {
  const bodyContents = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "filler" },
        {
          type: "image",
          url: jankenAsset(baseUrl, `${rankImageKey}.png`),
          size: "100px",
          aspectMode: "fit",
          flex: 0,
        },
        { type: "filler" },
      ],
    },
    {
      type: "text",
      text: rankLabel,
      align: "center",
      color: HERO_SURFACE.textAccent,
      weight: "bold",
      size: "xl",
    },
    {
      type: "text",
      text: `積分：${elo}`,
      align: "center",
      color: HERO_SURFACE.textMuted,
      size: "sm",
    },
    { type: "separator", color: HERO_SURFACE.divider, margin: "lg" },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: `${winCount} 勝`,
          align: "center",
          color: SEMANTIC.success.main,
          size: "sm",
          flex: 1,
        },
        {
          type: "text",
          text: `${loseCount} 敗`,
          align: "center",
          color: SEMANTIC.danger.main,
          size: "sm",
          flex: 1,
        },
        {
          type: "text",
          text: `${drawCount} 平`,
          align: "center",
          color: SEMANTIC.primary.light,
          size: "sm",
          flex: 1,
        },
      ],
      margin: "lg",
    },
    {
      type: "text",
      text: `勝率：${winRate}%`,
      align: "center",
      color: HERO_SURFACE.text,
      size: "sm",
      margin: "sm",
    },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: `連勝：${streak}`,
          align: "center",
          color: SEMANTIC.warning.main,
          size: "sm",
          flex: 1,
        },
        {
          type: "text",
          text: `最高：${maxStreak}`,
          align: "center",
          color: SEMANTIC.warning.main,
          size: "sm",
          flex: 1,
        },
      ],
      margin: "sm",
    },
    { type: "separator", color: HERO_SURFACE.divider, margin: "lg" },
    {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "懸賞金", color: HERO_SURFACE.textMuted, size: "xs", flex: 1 },
            {
              type: "text",
              text: `${bounty} 女神石`,
              color: HERO_SURFACE.text,
              size: "xs",
              align: "end",
              flex: 2,
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "最大下注", color: HERO_SURFACE.textMuted, size: "xs", flex: 1 },
            {
              type: "text",
              text: `${maxBet} 女神石`,
              color: HERO_SURFACE.text,
              size: "xs",
              align: "end",
              flex: 2,
            },
          ],
        },
        ...(serverRank !== null
          ? [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "全服排名",
                    color: HERO_SURFACE.textMuted,
                    size: "xs",
                    flex: 1,
                  },
                  {
                    type: "text",
                    text: `第 ${serverRank} 名`,
                    color: HERO_SURFACE.text,
                    size: "xs",
                    align: "end",
                    flex: 2,
                  },
                ],
              },
            ]
          : []),
        ...(eloToNext !== null
          ? [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "距下一段位",
                    color: HERO_SURFACE.textMuted,
                    size: "xs",
                    flex: 1,
                  },
                  {
                    type: "text",
                    text: `還差 ${eloToNext} 積分`,
                    color: HERO_SURFACE.textAccent,
                    size: "xs",
                    align: "end",
                    flex: 2,
                  },
                ],
              },
            ]
          : []),
      ],
      margin: "lg",
      spacing: "sm",
    },
  ];

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: HERO_SURFACE.bg,
      contents: bodyContents,
      paddingAll: "lg",
      spacing: "sm",
    },
    footer: {
      type: "box",
      layout: "vertical",
      backgroundColor: HERO_SURFACE.bg,
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "查看完整排行",
            uri: getLiffUri("full", "/janken"),
          },
          style: "link",
          color: SEMANTIC.primary.light,
          height: "sm",
        },
      ],
      paddingAll: "sm",
    },
  };
};
