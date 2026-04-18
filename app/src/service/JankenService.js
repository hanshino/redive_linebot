const redis = require("../util/redis");
const config = require("config");
const JankenRecords = require("../model/application/JankenRecords");
const JankenResult = require("../model/application/JankenResult");
const JankenAutoFateLog = require("../model/application/JankenAutoFateLog");
const UserAutoPreference = require("../model/application/UserAutoPreference");
const { inventory } = require("../model/application/Inventory");
const EventCenterService = require("./EventCenterService");
const SubscriptionService = require("./SubscriptionService");
const { DefaultLogger } = require("../util/Logger");
const JankenRating = require("../model/application/JankenRating");

const REDIS_PREFIX = config.get("redis.keys.jankenDecide");
const CHALLENGE_PREFIX = config.get("redis.keys.jankenChallenge");
const FEE_RATE = config.get("minigame.janken.bet.feeRate");
const MIN_BET = config.get("minigame.janken.bet.minAmount");
const BOUNTY_MIN_BET = config.get("minigame.janken.streak.bountyMinBet");
const BOUNTY_CLAIM_MULTIPLIER = config.get("minigame.janken.streak.bountyClaimMultiplier");

const RESULT_MAP = {
  rock: { rock: "draw", paper: "lose", scissors: "win" },
  paper: { rock: "win", paper: "draw", scissors: "lose" },
  scissors: { rock: "lose", paper: "win", scissors: "draw" },
};

exports.determineWinner = function (p1Choice, p2Choice) {
  return [RESULT_MAP[p1Choice][p2Choice], RESULT_MAP[p2Choice][p1Choice]];
};

exports.randomChoice = function () {
  const choices = ["rock", "paper", "scissors"];
  return choices[Math.floor(Math.random() * choices.length)];
};

exports.calculateBetSettlement = function (betAmount, outcome) {
  if (outcome === "draw") {
    return { refundEach: betAmount, fee: 0 };
  }
  const totalPot = betAmount * 2;
  const fee = Math.floor(totalPot * FEE_RATE);
  const winnerGets = totalPot - fee;
  return { winnerGets, fee };
};

exports.validateBet = function (amount, maxBet) {
  if (amount < MIN_BET) {
    return { valid: false, error: "message.duel.bet_too_low", errorParams: { min: MIN_BET } };
  }
  if (amount > maxBet) {
    return { valid: false, error: "message.duel.bet_too_high", errorParams: { max: maxBet } };
  }
  return { valid: true };
};

exports.escrowBet = async function (userId, amount) {
  const { amount: balance } = (await inventory.getUserMoney(userId)) || { amount: 0 };
  if (balance < amount) {
    return { success: false, balance };
  }
  await inventory.decreaseGodStone({ userId, amount, note: "janken_bet_escrow" });
  return { success: true };
};

exports.tryEscrowOnce = async function (matchId, userId, amount) {
  const escrowKey = `${REDIS_PREFIX}:escrow:${matchId}:${userId}`;
  const locked = await redis.set(escrowKey, "1", { EX: 3600, NX: true });
  if (!locked) {
    return { alreadyEscrowed: true };
  }
  const result = await exports.escrowBet(userId, amount);
  return result;
};

exports.calculateBountyIncrement = function (fee) {
  return fee;
};

exports.updateStreaks = async function (
  p1UserId,
  p2UserId,
  p1Result,
  { betAmount = 0, fee = 0 } = {}
) {
  if (p1Result === "draw" || !betAmount || betAmount <= 0) {
    return { winnerStreak: 0, loserPreviousStreak: 0, loserBounty: 0 };
  }

  const mysql = require("../util/mysql");
  const winnerId = p1Result === "win" ? p1UserId : p2UserId;
  const loserId = p1Result === "win" ? p2UserId : p1UserId;

  return mysql.transaction(async trx => {
    await Promise.all([
      JankenRating.findOrCreate(winnerId, trx),
      JankenRating.findOrCreate(loserId, trx),
    ]);

    const [winnerRating, loserRating] = await Promise.all([
      trx("janken_rating").where({ user_id: winnerId }).forUpdate().first(),
      trx("janken_rating").where({ user_id: loserId }).forUpdate().first(),
    ]);

    const newStreak = winnerRating.streak + 1;
    const newMaxStreak = Math.max(newStreak, winnerRating.max_streak);
    // Bounty funded from match fee — no new money created
    const bountyIncrement =
      newStreak >= 2 && betAmount >= BOUNTY_MIN_BET ? exports.calculateBountyIncrement(fee) : 0;
    const maxBounty = JankenRating.getMaxBounty(winnerRating.rank_tier);
    const newBounty = Math.min(winnerRating.bounty + bountyIncrement, maxBounty);
    // Bounty claim capped by claimer's bet amount
    const loserBounty = Math.min(loserRating.bounty, betAmount * BOUNTY_CLAIM_MULTIPLIER);

    await Promise.all([
      trx("janken_rating").where({ user_id: winnerId }).update({
        streak: newStreak,
        max_streak: newMaxStreak,
        bounty: newBounty,
      }),
      trx("janken_rating").where({ user_id: loserId }).update({
        streak: 0,
        bounty: 0,
      }),
    ]);

    if (loserBounty > 0) {
      await inventory.increaseGodStone({
        userId: winnerId,
        amount: loserBounty,
        note: "janken_bounty_claim",
      });
    }

    return {
      winnerStreak: newStreak,
      winnerBounty: newBounty,
      loserPreviousStreak: loserRating.streak,
      loserBounty,
    };
  });
};

/**
 * 猜拳代選判斷：若使用者開啟 auto_janken_fate 且訂閱包含該 effect，
 * 則用隨機出拳代為送出 submitChoice，並寫一筆 janken_auto_fate_log。
 * 僅用於標準對戰（duel）流程；arena 不呼叫。
 *
 * @param {string} userId 要代打的使用者
 * @param {string} matchId 對戰 uuid
 * @param {"p1"|"p2"} role 該使用者在這場對戰的角色
 * @param {Object} ctx
 * @param {string} ctx.p1UserId
 * @param {string} ctx.p2UserId
 * @returns {Promise<{eligible:boolean, ready?:boolean, p1Choice?:string, p2Choice?:string, choice?:string}>}
 */
exports.autoFateIfEligible = async function (userId, matchId, role, { p1UserId, p2UserId } = {}) {
  const enabled = config.has("autoJankenFate.enabled") && config.get("autoJankenFate.enabled");
  if (!enabled) return { eligible: false };

  const pref = await UserAutoPreference.first({ filter: { user_id: userId } });
  if (!pref || pref.auto_janken_fate !== 1) return { eligible: false };

  const entitled = await SubscriptionService.hasEffect(userId, "auto_janken_fate");
  if (!entitled) return { eligible: false };

  const choice = exports.randomChoice();
  await JankenAutoFateLog.create({ match_id: matchId, user_id: userId, role, choice });
  DefaultLogger.info(
    `janken.auto_fate.submit match_id=${matchId} user_id=${userId} role=${role} choice=${choice}`
  );
  const result = await exports.submitChoice(matchId, userId, choice, { p1UserId, p2UserId });
  return { eligible: true, choice, ...result };
};

exports.submitChoice = async function (matchId, userId, choice, { p1UserId, p2UserId } = {}) {
  if (choice === "random") {
    choice = exports.randomChoice();
  }

  const key = `${REDIS_PREFIX}:${matchId}:${userId}`;
  await redis.set(key, choice, { EX: 3600 });

  DefaultLogger.info(`[Janken] ${userId} chose ${choice} for match ${matchId}`);

  if (!p1UserId || !p2UserId) {
    return { ready: false };
  }

  const [p1Choice, p2Choice] = await Promise.all([
    redis.get(`${REDIS_PREFIX}:${matchId}:${p1UserId}`),
    redis.get(`${REDIS_PREFIX}:${matchId}:${p2UserId}`),
  ]);

  if (!p1Choice || !p2Choice) {
    return { ready: false };
  }

  return { ready: true, p1Choice, p2Choice };
};

exports.resolveMatch = async function ({
  matchId,
  groupId,
  p1UserId,
  p2UserId,
  p1Choice,
  p2Choice,
  betAmount = 0,
}) {
  const resolveKey = `${REDIS_PREFIX}:resolve:${matchId}`;
  const locked = await redis.set(resolveKey, "1", { EX: 60, NX: true });
  if (!locked) {
    DefaultLogger.info(`[Janken] Match ${matchId} already being resolved, skipping`);
    return null;
  }

  const [p1Result, p2Result] = exports.determineWinner(p1Choice, p2Choice);

  let betFee = 0;
  if (betAmount > 0) {
    if (p1Result === "draw") {
      await Promise.all([
        inventory.increaseGodStone({
          userId: p1UserId,
          amount: betAmount,
          note: "janken_bet_refund",
        }),
        inventory.increaseGodStone({
          userId: p2UserId,
          amount: betAmount,
          note: "janken_bet_refund",
        }),
      ]);
    } else {
      const { winnerGets, fee } = exports.calculateBetSettlement(betAmount, "win");
      betFee = fee;
      const winnerId = p1Result === "win" ? p1UserId : p2UserId;
      await inventory.increaseGodStone({
        userId: winnerId,
        amount: winnerGets,
        note: "janken_bet_win",
      });
    }
  }

  await JankenRecords.create({
    id: matchId,
    user_id: p1UserId,
    target_user_id: p2UserId,
    group_id: groupId,
    bet_amount: betAmount,
    bet_fee: betFee,
    p1_choice: p1Choice,
    p2_choice: p2Choice,
  });

  await JankenResult.insert([
    { record_id: matchId, user_id: p1UserId, result: JankenResult.resultMap[p1Result] },
    { record_id: matchId, user_id: p2UserId, result: JankenResult.resultMap[p2Result] },
  ]);

  await Promise.all([
    redis.del(`${REDIS_PREFIX}:${matchId}:${p1UserId}`),
    redis.del(`${REDIS_PREFIX}:${matchId}:${p2UserId}`),
  ]);

  await Promise.all([
    EventCenterService.add(EventCenterService.getEventName("daily_quest"), { userId: p1UserId }),
    EventCenterService.add(EventCenterService.getEventName("daily_quest"), { userId: p2UserId }),
  ]);

  const eloResult = await exports.updateElo(p1UserId, p2UserId, p1Result, betAmount);
  const streakResult = await exports.updateStreaks(p1UserId, p2UserId, p1Result, {
    betAmount,
    fee: betFee,
  });

  // Persist match details for frontend leaderboard
  const matchDetails = {};
  if (p1Result !== "draw") {
    matchDetails.elo_change = p1Result === "win" ? eloResult.p1EloChange : eloResult.p2EloChange;
  }
  if (streakResult.loserPreviousStreak > 0) {
    matchDetails.streak_broken = streakResult.loserPreviousStreak;
  }
  if (streakResult.loserBounty > 0) {
    matchDetails.bounty_won = streakResult.loserBounty;
  }
  if (Object.keys(matchDetails).length > 0) {
    await JankenRecords.update(matchId, matchDetails);
  }

  return { p1Result, p2Result, p1Choice, p2Choice, betFee, ...eloResult, ...streakResult };
};

exports.updateElo = async function (p1UserId, p2UserId, p1Result, betAmount) {
  if (p1Result === "draw") {
    if (betAmount > 0) {
      const mysql = require("../util/mysql");
      await mysql.transaction(async trx => {
        await Promise.all([
          JankenRating.findOrCreate(p1UserId, trx),
          JankenRating.findOrCreate(p2UserId, trx),
        ]);
        await Promise.all([
          trx("janken_rating")
            .where({ user_id: p1UserId })
            .update({ draw_count: trx.raw("draw_count + 1") }),
          trx("janken_rating")
            .where({ user_id: p2UserId })
            .update({ draw_count: trx.raw("draw_count + 1") }),
        ]);
      });
    }
    return { p1EloChange: 0, p2EloChange: 0, p1NewElo: null, p2NewElo: null };
  }

  if (!betAmount || betAmount <= 0) {
    return { p1EloChange: 0, p2EloChange: 0, p1NewElo: null, p2NewElo: null };
  }

  const mysql = require("../util/mysql");

  return mysql.transaction(async trx => {
    await Promise.all([
      JankenRating.findOrCreate(p1UserId, trx),
      JankenRating.findOrCreate(p2UserId, trx),
    ]);

    const [p1Rating, p2Rating] = await Promise.all([
      trx("janken_rating").where({ user_id: p1UserId }).forUpdate().first(),
      trx("janken_rating").where({ user_id: p2UserId }).forUpdate().first(),
    ]);

    const p1Streak = p1Rating.streak || 0;
    const p2Streak = p2Rating.streak || 0;
    const p1EloChange = exports.calculateEloChange(
      p1Rating.elo,
      p2Rating.elo,
      p1Result,
      betAmount,
      {
        streak: p1Streak,
      }
    );
    const p2Result = p1Result === "win" ? "lose" : "win";
    const p2EloChange = exports.calculateEloChange(
      p2Rating.elo,
      p1Rating.elo,
      p2Result,
      betAmount,
      {
        streak: p2Streak,
      }
    );

    const p1NewElo = Math.max(0, p1Rating.elo + p1EloChange);
    const p2NewElo = Math.max(0, p2Rating.elo + p2EloChange);

    const p1WinKey = p1Result === "win" ? "win_count" : "lose_count";
    const p2WinKey = p1Result === "win" ? "lose_count" : "win_count";

    await Promise.all([
      trx("janken_rating")
        .where({ user_id: p1UserId })
        .update({
          elo: p1NewElo,
          rank_tier: JankenRating.getRankTier(p1NewElo),
          [p1WinKey]: trx.raw(`${p1WinKey} + 1`),
        }),
      trx("janken_rating")
        .where({ user_id: p2UserId })
        .update({
          elo: p2NewElo,
          rank_tier: JankenRating.getRankTier(p2NewElo),
          [p2WinKey]: trx.raw(`${p2WinKey} + 1`),
        }),
    ]);

    return {
      p1EloChange,
      p2EloChange,
      p1NewElo,
      p2NewElo,
      p1RankLabel: JankenRating.getRankLabel(p1NewElo),
      p2RankLabel: JankenRating.getRankLabel(p2NewElo),
    };
  });
};

exports.calculateExpectedWinRate = function (myElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
};

exports.getStreakMultiplier = function (streak) {
  const tiers = config.get("minigame.janken.elo.streakBonus");
  for (const tier of tiers) {
    if (streak >= tier.minStreak) return tier.multiplier;
  }
  return 1;
};

exports.calculateEloChange = function (myElo, opponentElo, result, betAmount, { streak = 0 } = {}) {
  if (result === "draw") return 0;
  const K = JankenRating.getKFactor(betAmount);
  const expected = exports.calculateExpectedWinRate(myElo, opponentElo);
  const actual = result === "win" ? 1 : 0;
  const raw = K * (actual - expected);
  if (raw >= 0) {
    const multiplier = result === "win" ? exports.getStreakMultiplier(streak) : 1;
    return Math.floor(raw * multiplier);
  }
  const lossFactor = config.get("minigame.janken.elo.lossFactor");
  return Math.ceil(raw * lossFactor);
};

exports.submitArenaChallenge = async function (groupId, holderUserId, challengerUserId, choice) {
  if (choice === "random") {
    choice = exports.randomChoice();
  }

  const redisKey = `${CHALLENGE_PREFIX}:${groupId}:${holderUserId}`;

  const hasSet = await redis.set(redisKey, JSON.stringify({ challengerUserId, choice }), {
    EX: 10 * 60,
    NX: true,
  });

  if (!hasSet) {
    const existing = await redis.get(redisKey);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed.challengerUserId === challengerUserId) {
        await redis.set(redisKey, JSON.stringify({ challengerUserId, choice }));
        return { accepted: true, updated: true };
      }
    }
    return { accepted: false };
  }

  return { accepted: true, updated: false };
};

exports.resolveArena = async function (groupId, holderUserId, holderChoice) {
  if (holderChoice === "random") {
    holderChoice = exports.randomChoice();
  }

  const redisKey = `${CHALLENGE_PREFIX}:${groupId}:${holderUserId}`;
  const content = await redis.get(redisKey);

  if (!content) {
    return null;
  }

  const { challengerUserId, choice: challengerChoice } = JSON.parse(content);
  await redis.del(redisKey);

  return { challengerUserId, challengerChoice, holderChoice };
};
