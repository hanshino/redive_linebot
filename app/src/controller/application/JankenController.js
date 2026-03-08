// eslint-disable-next-line no-unused-vars
const { Context, getClient } = require("bottender");
const { text } = require("bottender/router");
const get = require("lodash/get");
const i18n = require("../../util/i18n");
const LineClient = getClient("line");
const jankenTemplate = require("../../templates/application/Janken");
const JankenRating = require("../../model/application/JankenRating");
const JankenRecords = require("../../model/application/JankenRecords");
const JankenService = require("../../service/JankenService");
const uuid = require("uuid-random");
const { DefaultLogger } = require("../../util/Logger");

const baseUrl = `https://${process.env.APP_DOMAIN}`;
const BountySender = { name: "懸賞官", iconUrl: `${baseUrl}/assets/janken/bounty.png` };

exports.router = [
  text(/^[.#/](猜拳段位|猜拳rank)/, queryRank),
  text(/^[.#/](猜拳)/, duel),
  text(/^[.#/](決鬥|duel)/, duel),
  text(/^[.#/](猜拳(擂台|(大|比)賽)|hold)/, holdingChallenge),
];

/**
 * 查詢猜拳段位
 * @param {Context} context
 */
async function queryRank(context) {
  const { userId } = context.event.source;

  if (!userId) {
    return;
  }

  const rating = await JankenRating.findOrCreate(userId);
  const rankLabel = JankenRating.getRankLabel(rating.elo);
  const rankImageKey = JankenRating.getRankImageKey(rating.elo);
  const rankTier = JankenRating.getRankTier(rating.elo);
  const maxBet = JankenRating.getMaxBet(rankTier);
  const nextTierElo = JankenRating.getNextTierElo(rating.elo);
  const eloToNext = nextTierElo !== null ? nextTierElo - rating.elo : null;
  const totalGames = rating.win_count + rating.lose_count + rating.draw_count;
  const serverRank = totalGames > 0 ? await JankenRating.getServerRank(userId) : null;
  const winRate = totalGames > 0 ? Math.round((rating.win_count / totalGames) * 100) : 0;

  const rankCard = jankenTemplate.generateRankCard({
    rankLabel,
    rankImageKey,
    elo: rating.elo,
    winCount: rating.win_count,
    loseCount: rating.lose_count,
    drawCount: rating.draw_count,
    winRate,
    streak: rating.streak,
    maxStreak: rating.max_streak,
    bounty: rating.bounty,
    eloToNext,
    serverRank,
    maxBet,
    baseUrl,
  });

  await context.replyFlex("猜拳段位", rankCard);
}

/**
 * 實現決鬥功能，可以與其他人決鬥
 * @param {Context} context
 */
async function duel(context) {
  const { mention } = context.event.message;
  const mentionees = get(mention, "mentionees", []);
  const { groupId, type, displayName, pictureUrl, userId } = context.event.source;

  if (type !== "group") {
    await context.replyText(i18n.__("message.duel.only_in_group"));
    return;
  } else if (mentionees.length === 0) {
    await context.replyText(i18n.__("message.duel.usage"));
    return;
  } else if (mentionees.length > 1) {
    await context.replyText(i18n.__("message.duel.too_many_mentions"));
    return;
  }

  if (!userId) {
    await context.replyText(i18n.__("message.duel.failed_to_get_user_id"));
    return;
  }

  const { userId: targetUserId, index, length } = mentionees[0];

  if (!targetUserId) {
    await context.replyText(i18n.__("message.duel.failed_to_get_target_user_id"));
    return;
  }

  if (userId === targetUserId) {
    await context.replyText(i18n.__("message.duel.self_duel"));
    return;
  }

  // Extract optional bet amount from message text (e.g. /猜拳 @player 100)
  let betAmount = 0;
  const rawText = context.event.message.text;
  const textWithoutMention = rawText.substr(0, index) + rawText.substr(index + length);
  const betMatch = textWithoutMention.match(/(\d+)\s*$/);
  if (betMatch) {
    betAmount = parseInt(betMatch[1], 10);
  }

  if (betAmount > 0) {
    const [initiatorRating, targetRating] = await Promise.all([
      JankenRating.findOrCreate(userId),
      JankenRating.findOrCreate(targetUserId),
    ]);
    const initiatorTier = JankenRating.getRankTier(initiatorRating.elo);
    const targetTier = JankenRating.getRankTier(targetRating.elo);
    const maxBet = Math.min(
      JankenRating.getMaxBet(initiatorTier),
      JankenRating.getMaxBet(targetTier)
    );

    const validation = JankenService.validateBet(betAmount, maxBet);
    if (!validation.valid) {
      await context.replyText(i18n.__(validation.error, validation.errorParams));
      return;
    }

    const escrow = await JankenService.escrowBet(userId, betAmount);
    if (!escrow.success) {
      await context.replyText(
        i18n.__("message.duel.insufficient_funds", { balance: escrow.balance })
      );
      return;
    }
  }

  const targetProfile = await LineClient.getGroupMemberProfile(groupId, targetUserId);

  const matchId = uuid();

  const pkBubble = jankenTemplate.generateDuelCard({
    p1IconUrl: pictureUrl || "https://i.imgur.com/469kcyB.png",
    p2IconUrl: get(targetProfile, "pictureUrl", "https://i.imgur.com/469kcyB.png"),
    p1Uid: userId,
    p2Uid: targetUserId,
    uuid: matchId,
    betAmount,
    title: "",
    baseUrl,
  });

  await context.replyText(
    i18n.__("message.duel.start", {
      displayName,
      targetDisplayName: get(targetProfile, "displayName", "未知玩家"),
    })
  );
  await context.replyFlex("猜拳", pkBubble);
}

/**
 * 決定出拳 (postback handler for action: "janken")
 * @param {Context} context
 * @param {import("bottender").Props} props
 * @param {Object} props.payload
 */
exports.decide = async (context, { payload }) => {
  const { uuid: matchId, userId, targetUserId, betAmount = 0 } = payload;

  if (!matchId) {
    return;
  }

  const sourceUserId = context.event.source.userId;

  // Only p1 or p2 may respond
  if (![userId, targetUserId].includes(sourceUserId)) {
    return;
  }

  const choice = get(payload, "type", "random");

  // Escrow opponent's bet when they first submit (if bet > 0 and they are not the initiator)
  if (betAmount > 0 && sourceUserId === targetUserId) {
    const escrowGuard = await JankenService.tryEscrowOnce(matchId, sourceUserId, betAmount);
    if (escrowGuard.alreadyEscrowed) {
      // Already processed, skip
    } else if (!escrowGuard.success) {
      await context.replyText(
        i18n.__("message.duel.insufficient_funds", {
          balance: escrowGuard.balance,
        })
      );
      return;
    }
  }

  const result = await JankenService.submitChoice(matchId, sourceUserId, choice, {
    p1UserId: userId,
    p2UserId: targetUserId,
  });

  if (!result.ready) {
    // Waiting for the other player
    return;
  }

  DefaultLogger.info(`[Janken] Match ${matchId} ready. Resolving...`);

  const { p1Choice, p2Choice } = result;
  const groupId = context.event.source.groupId;

  const [profile, targetProfile] = await Promise.all([
    LineClient.getGroupMemberProfile(groupId, userId),
    LineClient.getGroupMemberProfile(groupId, targetUserId),
  ]);

  const matchResult = await JankenService.resolveMatch({
    matchId,
    groupId,
    p1UserId: userId,
    p2UserId: targetUserId,
    p1Choice,
    p2Choice,
    betAmount,
  });

  if (!matchResult) {
    return;
  }

  const { p1Result, betFee, p1EloChange, p2EloChange, p1NewElo, p2NewElo } = matchResult;

  const p1Name = get(profile, "displayName", "未知玩家");
  const p2Name = get(targetProfile, "displayName", "未知挑戰者");
  const winnerName = p1Result === "win" ? p1Name : p2Name;
  const betWinAmount = betAmount > 0 ? betAmount * 2 - betFee : 0;

  const { winnerStreak, winnerBounty, loserPreviousStreak, loserBounty } = matchResult;

  const resultBubble = jankenTemplate.generateResultCard({
    p1Name,
    p2Name,
    p1Choice,
    p2Choice,
    resultType: p1Result,
    winnerName,
    betAmount,
    betWinAmount,
    baseUrl,
    winnerStreak,
    p1EloChange,
    p2EloChange,
    p1NewElo,
    p2NewElo,
  });

  await context.replyFlex("猜拳結果", resultBubble);

  if (p1Result !== "draw") {
    if (loserBounty > 0) {
      const breakerName = p1Result === "win" ? p1Name : p2Name;
      const holderName = p1Result === "win" ? p2Name : p1Name;
      await context.replyText(
        i18n.__("message.duel.streak_broken", {
          breakerName,
          holderName,
          streak: loserPreviousStreak,
          bounty: loserBounty,
        }),
        { sender: BountySender }
      );
    }

    if (winnerBounty > 0 && winnerStreak >= 2) {
      await context.replyText(
        i18n.__("message.duel.streak_continue", {
          displayName: winnerName,
          streak: winnerStreak,
          bounty: winnerBounty,
        }),
        { sender: BountySender }
      );
    }
  }
};

/**
 * 實現挑戰功能，舉辦方可以接受任何人的挑戰
 * @param {Context} context
 */
async function holdingChallenge(context) {
  const { userId, pictureUrl, displayName, groupId, type } = context.event.source;

  if (type !== "group") {
    await context.replyText(i18n.__("message.duel.only_in_group"));
    return;
  }

  if (!userId) {
    return;
  }

  const [, title = ""] = context.event.message.text.split(/\s+/);

  const holderBubble = jankenTemplate.generateArenaCard({
    userId,
    groupId,
    iconUrl: pictureUrl || "https://i.imgur.com/469kcyB.png",
    title,
    baseUrl,
  });

  await context.replyText(i18n.__("message.duel.holding_manual", { displayName }));
  await context.replyFlex("猜拳大賽", holderBubble);
}

/**
 * 挑戰/舉辦方出拳 (postback handler for action: "challenge")
 * @param {Context} context
 * @param {import("bottender").Props} props
 */
exports.challenge = async (context, { payload }) => {
  const { userId: holderUserId, groupId } = payload;
  const sourceUserId = get(context.event.source, "userId");

  if (!sourceUserId) {
    return;
  }

  const isHolder = sourceUserId === holderUserId;

  DefaultLogger.info(
    `[Janken] ${sourceUserId} ${isHolder ? "holder" : "challenger"} action vs ${holderUserId}`
  );

  if (!isHolder) {
    // Challenger submits their choice
    const choice = get(payload, "type", "random");
    const result = await JankenService.submitArenaChallenge(
      groupId,
      holderUserId,
      sourceUserId,
      choice
    );

    if (!result.accepted) {
      // Another challenger is already queued
      return;
    }

    if (!result.updated) {
      // First time challenging — notify
      const holderProfile = await LineClient.getGroupMemberProfile(
        context.event.source.groupId,
        holderUserId
      );
      const { displayName } = context.event.source;
      await context.replyText(
        i18n.__("message.duel.challenge_success", {
          targetDisplayName: get(holderProfile, "displayName", "未知玩家"),
          displayName,
        })
      );
    }
  } else {
    // Holder reveals their choice and resolves
    const holderChoice = get(payload, "type", "random");
    const arenaResult = await JankenService.resolveArena(groupId, holderUserId, holderChoice);

    if (!arenaResult) {
      DefaultLogger.info(`[Janken] ${holderUserId} has no challenger yet`);
      return;
    }

    const { challengerUserId, challengerChoice, holderChoice: resolvedHolderChoice } = arenaResult;
    const matchId = uuid();

    const [holderProfile, challengerProfile] = await Promise.all([
      LineClient.getGroupMemberProfile(context.event.source.groupId, holderUserId),
      LineClient.getGroupMemberProfile(context.event.source.groupId, challengerUserId),
    ]);

    const arenaMatchResult = await JankenService.resolveMatch({
      matchId,
      groupId,
      p1UserId: holderUserId,
      p2UserId: challengerUserId,
      p1Choice: resolvedHolderChoice,
      p2Choice: challengerChoice,
      betAmount: 0,
    });

    if (!arenaMatchResult) {
      return;
    }

    const { p1Result, p1EloChange, p2EloChange, p1NewElo, p2NewElo } = arenaMatchResult;

    const { winnerStreak, winnerBounty, loserPreviousStreak, loserBounty } = arenaMatchResult;

    const p1Name = get(holderProfile, "displayName", "未知玩家");
    const p2Name = get(challengerProfile, "displayName", "未知挑戰者");
    const winnerName = p1Result === "win" ? p1Name : p2Name;

    const resultBubble = jankenTemplate.generateResultCard({
      p1Name,
      p2Name,
      p1Choice: resolvedHolderChoice,
      p2Choice: challengerChoice,
      resultType: p1Result,
      winnerName,
      betAmount: 0,
      betWinAmount: 0,
      baseUrl,
      winnerStreak,
      p1EloChange,
      p2EloChange,
      p1NewElo,
      p2NewElo,
    });

    await context.replyFlex("猜拳結果", resultBubble);

    if (p1Result !== "draw") {
      if (loserBounty > 0) {
        const breakerName = p1Result === "win" ? p1Name : p2Name;
        const holderName = p1Result === "win" ? p2Name : p1Name;
        await context.replyText(
          i18n.__("message.duel.streak_broken", {
            breakerName,
            holderName,
            streak: loserPreviousStreak,
            bounty: loserBounty,
          }),
          { sender: BountySender }
        );
      }

      if (winnerBounty > 0 && winnerStreak >= 2) {
        await context.replyText(
          i18n.__("message.duel.streak_continue", {
            displayName: winnerName,
            streak: winnerStreak,
            bounty: winnerBounty,
          }),
          { sender: BountySender }
        );
      }
    }
  }
};

exports.api = {};

exports.api.rankings = async (req, res) => {
  try {
    const ratings = await JankenRating.getTopRankings(20);

    const result = ratings.map((r, index) => {
      const total = r.win_count + r.lose_count + r.draw_count;
      const winRate = total > 0 ? Math.round((r.win_count / total) * 1000) / 10 : 0;

      return {
        rank: index + 1,
        displayName: r.display_name || `玩家${index + 1}`,
        rankLabel: JankenRating.getRankLabel(r.elo),
        rankTier: r.rank_tier,
        rankImage: `/assets/janken/${JankenRating.getRankImageKey(r.elo)}.png`,
        elo: r.elo,
        winCount: r.win_count,
        loseCount: r.lose_count,
        drawCount: r.draw_count,
        winRate,
        streak: r.streak,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[Janken Rankings API]", err);
    res.status(500).json({ message: "Failed to fetch rankings" });
  }
};

exports.api.recentMatches = async (req, res) => {
  try {
    const matches = await JankenRecords.getRecentMatches(20);
    const resultMap = { 1: "win", 2: "lose", 0: "draw" };
    const choiceMap = { rock: "石頭", paper: "布", scissors: "剪刀" };

    const result = matches.map(m => ({
      id: m.id,
      player1: {
        displayName: m.p1_display_name || "未知玩家",
        choice: choiceMap[m.p1_choice] || m.p1_choice,
        result: resultMap[m.p1_result] || "draw",
      },
      player2: {
        displayName: m.p2_display_name || "未知玩家",
        choice: choiceMap[m.p2_choice] || m.p2_choice,
        result: resultMap[m.p2_result] || "draw",
      },
      betAmount: m.bet_amount || 0,
      eloChange: m.elo_change || 0,
      streakBroken: m.streak_broken || null,
      bountyWon: m.bounty_won || null,
      createdAt: m.created_at,
    }));

    res.json(result);
  } catch (err) {
    console.error("[Janken Recent Matches API]", err);
    res.status(500).json({ message: "Failed to fetch recent matches" });
  }
};
