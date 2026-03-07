const redis = require("../util/redis");
const config = require("config");
const JankenRecords = require("../model/application/JankenRecords");
const JankenResult = require("../model/application/JankenResult");
const { inventory } = require("../model/application/Inventory");
const EventCenterService = require("./EventCenterService");
const { DefaultLogger } = require("../util/Logger");
const JankenRating = require("../model/application/JankenRating");

const REDIS_PREFIX = config.get("redis.keys.jankenDecide");
const CHALLENGE_PREFIX = config.get("redis.keys.jankenChallenge");
const FEE_RATE = config.get("minigame.janken.bet.feeRate");
const MIN_BET = config.get("minigame.janken.bet.minAmount");
const BOUNTY_RATE = config.get("minigame.janken.streak.bountyRate");
const STREAK_MAX_BOUNTY = config.get("minigame.janken.streak.maxBounty");

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

exports.calculateBountyIncrement = function (betAmount) {
  return Math.floor(betAmount * BOUNTY_RATE);
};

exports.updateStreaks = async function (p1UserId, p2UserId, p1Result, { betAmount = 0 } = {}) {
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
    const bountyIncrement = exports.calculateBountyIncrement(betAmount);
    const newBounty = Math.min(winnerRating.bounty + bountyIncrement, STREAK_MAX_BOUNTY);
    const loserBounty = loserRating.bounty;

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

  return { p1Result, p2Result, p1Choice, p2Choice, betFee };
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
