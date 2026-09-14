const redis = require("../util/redis");
const mysql = require("../util/mysql");
const config = require("config");
const JankenRecords = require("../model/application/JankenRecords");
const JankenResult = require("../model/application/JankenResult");
const JankenAutoMatchParticipant = require("../model/application/JankenAutoMatchParticipant");
const JankenAutoMatchOutbox = require("../model/application/JankenAutoMatchOutbox");
const JankenAutoFateLog = require("../model/application/JankenAutoFateLog");
const UserAutoPreference = require("../model/application/UserAutoPreference");
const { inventory } = require("../model/application/Inventory");
const SubscriptionService = require("./SubscriptionService");
const { DefaultLogger } = require("../util/Logger");
const JankenRating = require("../model/application/JankenRating");

const REDIS_PREFIX = config.get("redis.keys.jankenDecide");
const CHALLENGE_PREFIX = config.get("redis.keys.jankenChallenge");
const FEE_RATE = config.get("minigame.janken.bet.feeRate");
const MIN_BET = config.get("minigame.janken.bet.minAmount");
const BOUNTY_MIN_BET = config.get("minigame.janken.streak.bountyMinBet");
const BOUNTY_CLAIM_MULTIPLIER = config.get("minigame.janken.streak.bountyClaimMultiplier");
const PAIR_DAMP_THRESHOLD = config.get("minigame.janken.pairDampening.matchesThreshold");
const PAIR_DAMP_BIAS_MULTIPLIER = config.get("minigame.janken.pairDampening.biasMultiplier");
// How long a duel stays playable: the per-player choice keys and the escrow NX locks both
// expire after this. Once it lapses the match can never be resolved, so any escrow still
// posted for it is dead money. REFUND_THRESHOLD_MS below MUST stay strictly greater than
// this, otherwise the refund cron could race a still-resolvable match and mint stones.
const MATCH_WINDOW_SECONDS = 60 * 60;

// Refund escrows that have been pending longer than this. Must be > MATCH_WINDOW_SECONDS
// so a refunded match is provably unresolvable (its choice keys are already gone).
const REFUND_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// Sorted set of outstanding escrows, scored by the epoch-ms the stones were taken.
const PENDING_ESCROW_KEY = `${REDIS_PREFIX}:escrow:pending`;
// matchId is a uuid (hex + "-") and userId is "U" + 32 hex, so neither can ever contain
// "|" — it is a safe, collision-free separator for the packed member.
const ESCROW_MEMBER_SEP = "|";
const packEscrowMember = (matchId, userId, amount) =>
  [matchId, userId, amount].join(ESCROW_MEMBER_SEP);

// LINE userIds are fixed-length (`U` + 32 hex chars), so byte-order ordering is canonical.
const orderedPair = (uA, uB) => (uA < uB ? [uA, uB] : [uB, uA]);

const upsertPairStats = (trx, playerA, playerB, { aWins = 0, bWins = 0, draws = 0 }) =>
  trx.raw(
    "INSERT INTO janken_pair_stats (player_a, player_b, matches, a_wins, b_wins, draws, last_match_at) " +
      "VALUES (?, ?, 1, ?, ?, ?, NOW()) " +
      "ON DUPLICATE KEY UPDATE matches = matches + 1, " +
      "a_wins = a_wins + VALUES(a_wins), " +
      "b_wins = b_wins + VALUES(b_wins), " +
      "draws = draws + VALUES(draws), " +
      "last_match_at = VALUES(last_match_at)",
    [playerA, playerB, aWins, bWins, draws]
  );

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

exports.escrowBet = async function (userId, amount, matchId) {
  // KTD3：扣款前在交易內鎖 user 列（鎖序 ①）＋鎖讀 wallet（鎖序 ⑥）再重讀餘額，
  // 同一 user 的兩筆並發 escrow 不會都看到「扣款前」的餘額。
  const debit = await mysql.transaction(async trx => {
    await lockUserRows(trx, [userId]);
    const balance = await inventory.lockGodStoneBalance(userId, trx);
    if (balance < amount) return { success: false, balance };
    await inventory.decreaseGodStone({ userId, amount, note: "janken_bet_escrow", trx });
    return { success: true, balance };
  });
  if (!debit.success) {
    return { success: false, balance: debit.balance };
  }
  const { balance } = debit;
  // Track the escrow so refundStaleEscrows can return it if the match never resolves.
  // Ledger-first ordering: if we crash between the debit and the zAdd, zAdd-first would
  // let the cron refund an escrow that was never actually taken (minting stones).
  // 已知 deferred gap（計畫 KTD3）：debit 已 commit → zAdd 之前 crash，該筆 escrow 不會被 cron 退。
  try {
    await redis.zAdd(PENDING_ESCROW_KEY, {
      score: Date.now(),
      value: packEscrowMember(matchId, userId, amount),
    });
  } catch (err) {
    // Debited but untracked = permanently lost stones. Reverse immediately rather than
    // leaving it for manual reconciliation.
    DefaultLogger.error(
      `[Janken] escrow tracking failed, rolling back match_id=${matchId} ` +
        `user_id=${userId} amount=${amount}: ${err && err.message}`,
      err
    );
    await inventory.increaseGodStone({
      userId,
      amount,
      note: "janken_bet_escrow_rollback",
    });
    return { success: false, balance };
  }
  return { success: true };
};

exports.tryEscrowOnce = async function (matchId, userId, amount) {
  const escrowKey = `${REDIS_PREFIX}:escrow:${matchId}:${userId}`;
  const locked = await redis.set(escrowKey, "1", { EX: MATCH_WINDOW_SECONDS, NX: true });
  if (!locked) {
    return { alreadyEscrowed: true };
  }
  // The lock means "this player already staked". If the debit did NOT happen, the lock is
  // a lie and must go: leaving it lets the next click take the `alreadyEscrowed` branch,
  // which callers read as "already paid" and wave through to submitChoice — a player with
  // too few stones could click twice and play a bet match for free.
  let result;
  try {
    result = await exports.escrowBet(userId, amount, matchId);
  } catch (err) {
    await redis.del(escrowKey);
    throw err;
  }
  if (!result.success) {
    await redis.del(escrowKey);
  }
  return result;
};

/**
 * Is this bet match still resolvable?
 *
 * Probes p1's escrow lock, which is written with EX = MATCH_WINDOW_SECONDS at the moment
 * p1 posts their stake — the same lifetime as the per-player choice keys. So the lock
 * being gone is equivalent to "the choice keys are gone too", i.e. the match can never
 * reach resolveMatch and its escrow has been (or will be) refunded by the cron.
 *
 * Only meaningful for bet matches; non-bet matches have no escrow lock and no money at
 * risk, so callers must not gate them on this.
 *
 * @param {string} matchId
 * @param {string} p1UserId the duel initiator (payload.userId)
 * @returns {Promise<boolean>}
 */
exports.isMatchAlive = async function (matchId, p1UserId) {
  const escrowKey = `${REDIS_PREFIX}:escrow:${matchId}:${p1UserId}`;
  const exists = await redis.exists(escrowKey);
  return exists === 1;
};

/**
 * Refund escrows whose match is past REFUND_THRESHOLD_MS and therefore unresolvable.
 *
 * Claim-then-pay: the zRem must return 1 before any stones are credited. If another
 * worker (or resolveMatch's settlement cleanup) already took the member, we pay nothing.
 * Losing a refund is recoverable by hand from the `janken_bet_escrow` ledger rows;
 * double-paying is not.
 *
 * @returns {Promise<{scanned:number, refunded:number, failed:number}>}
 */
exports.refundStaleEscrows = async function () {
  const cutoff = Date.now() - REFUND_THRESHOLD_MS;
  const members = (await redis.zRangeByScore(PENDING_ESCROW_KEY, 0, cutoff)) || [];
  let refunded = 0;
  let failed = 0;

  for (const member of members) {
    try {
      const [matchId, userId, rawAmount] = String(member).split(ESCROW_MEMBER_SEP);
      const amount = parseInt(rawAmount, 10);
      if (!matchId || !userId || !Number.isFinite(amount) || amount <= 0) {
        await redis.zRem(PENDING_ESCROW_KEY, member);
        DefaultLogger.error(`[JankenEscrowRefund] dropped malformed member=${member}`);
        failed += 1;
        continue;
      }

      // Durable settled check（KTD3）：resolveMatch 已 commit 但在 zRem 之前 crash 的場次，
      // janken_records 已有該 matchId —— 賭金已結算，只清 member、不退款。
      if (await JankenRecords.find(matchId)) {
        await redis.zRem(PENDING_ESCROW_KEY, member);
        DefaultLogger.info(`[JankenEscrowRefund] skipped settled match_id=${matchId}`);
        continue;
      }

      const claimed = await redis.zRem(PENDING_ESCROW_KEY, member);
      if (claimed !== 1) {
        // Settled or claimed elsewhere — never pay out on an unclaimed member.
        continue;
      }

      await inventory.increaseGodStone({ userId, amount, note: "janken_bet_timeout_refund" });
      refunded += 1;
      DefaultLogger.info(
        `[JankenEscrowRefund] refunded match_id=${matchId} user_id=${userId} amount=${amount}`
      );
    } catch (err) {
      failed += 1;
      DefaultLogger.error(
        `[JankenEscrowRefund] failed member=${member}: ${err && err.message}`,
        err
      );
    }
  }

  return { scanned: members.length, refunded, failed };
};

exports.calculateBountyIncrement = function (fee) {
  return fee;
};

// ---------------------------------------------------------------------------------------
// 結算 core（KTD3）。所有 Janken 寫入路徑共用同一把鎖序，逐列 await、不用 Promise.all 取鎖：
//   ① user 兩列依 user_id ASC → ② participant（auto）→ ③ subscribe_user／user_auto_preference（auto，
//   由 auto.authorize 在 hook 內依序鎖）→ ④ janken_pair_stats canonical orderedPair →
//   ⑤ janken_rating 兩列 ASC → ⑥ inventory itemId=999 依 user_id ASC（鎖讀／扣款／payout／bounty
//   全部在 ⑤ 之後才碰 inventory）。
// core 不開交易、不碰 Redis／LINE／Bottender context；呼叫端負責 mysql.transaction 與 commit 後的副作用。
// ---------------------------------------------------------------------------------------

const RETRYABLE_LOCK_CODES = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);
exports.isRetryableLockError = err => Boolean(err && RETRYABLE_LOCK_CODES.has(err.code));

class SettlementError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}
exports.SettlementError = SettlementError;

const ascending = ids => [...ids].sort();

async function lockUserRows(trx, userIds) {
  for (const userId of ascending(userIds)) {
    await trx("user").where({ platform_id: userId }).forUpdate().first("id");
  }
}

/** 段位下注上限；0 是合法值，不能寫成 `maxByRank[tier] || fallback`（計畫 Q1）。 */
function rankMaxBet(rankTier) {
  const maxByRank = config.get("minigame.janken.bet.maxAmountByRank");
  return Object.prototype.hasOwnProperty.call(maxByRank, rankTier)
    ? maxByRank[rankTier]
    : maxByRank.beginner;
}

function defaultRating(userId) {
  return {
    user_id: userId,
    elo: config.get("minigame.janken.elo.initial"),
    rank_tier: "beginner",
    streak: 0,
    max_streak: 0,
    bounty: 0,
    last_won_opponent_id: null,
  };
}

/** ⑤：依 user_id ASC 逐列 FOR UPDATE 讀 rating；不存在的列不在此建立（避免非下注場多出 rating 列）。 */
async function lockRatings(trx, userIds) {
  const ratings = {};
  for (const userId of ascending(userIds)) {
    const row = await trx("janken_rating").where({ user_id: userId }).forUpdate().first();
    ratings[userId] = row || defaultRating(userId);
  }
  return ratings;
}

async function ensureRatingRows(trx, userIds) {
  for (const userId of ascending(userIds)) {
    await JankenRating.findOrCreate(userId, trx);
  }
}

/**
 * Elo／勝負場數／pair_stats（原 updateElo 的交易內本體）。ratings／priorPairStats 由呼叫端在 ④⑤ 鎖好後傳入。
 */
async function applyEloInTransaction(
  trx,
  { p1UserId, p2UserId, p1Result, betAmount, ratings, priorPairStats }
) {
  const zero = { p1EloChange: 0, p2EloChange: 0, p1NewElo: null, p2NewElo: null };
  const [playerA, playerB] = orderedPair(p1UserId, p2UserId);

  if (p1Result === "draw") {
    if (betAmount > 0) {
      await ensureRatingRows(trx, [p1UserId, p2UserId]);
      await upsertPairStats(trx, playerA, playerB, { draws: 1 });
      for (const userId of [playerA, playerB]) {
        await trx("janken_rating")
          .where({ user_id: userId })
          .update({ draw_count: trx.raw("draw_count + 1") });
      }
    }
    return zero;
  }

  const nonBetK = config.get("minigame.janken.elo.nonBetK");
  if ((!betAmount || betAmount <= 0) && (!nonBetK || nonBetK <= 0)) {
    return zero;
  }

  await ensureRatingRows(trx, [p1UserId, p2UserId]);
  const p1Rating = ratings[p1UserId];
  const p2Rating = ratings[p2UserId];
  const pairDampening = exports.calculatePairDampening(priorPairStats || undefined);

  const p1EloChange = exports.calculateEloChange(p1Rating.elo, p2Rating.elo, p1Result, betAmount, {
    streak: p1Rating.streak || 0,
    pairDampening,
  });
  const p2Result = p1Result === "win" ? "lose" : "win";
  const p2EloChange = exports.calculateEloChange(p2Rating.elo, p1Rating.elo, p2Result, betAmount, {
    streak: p2Rating.streak || 0,
    pairDampening,
  });

  const p1NewElo = Math.max(0, p1Rating.elo + p1EloChange);
  const p2NewElo = Math.max(0, p2Rating.elo + p2EloChange);
  const p1WinKey = p1Result === "win" ? "win_count" : "lose_count";
  const p2WinKey = p1Result === "win" ? "lose_count" : "win_count";

  const winnerIsA =
    (p1Result === "win" && p1UserId === playerA) || (p1Result === "lose" && p2UserId === playerA);
  await upsertPairStats(trx, playerA, playerB, {
    aWins: winnerIsA ? 1 : 0,
    bWins: winnerIsA ? 0 : 1,
  });

  const updates = {
    [p1UserId]: {
      elo: p1NewElo,
      rank_tier: JankenRating.getRankTier(p1NewElo),
      [p1WinKey]: trx.raw(`${p1WinKey} + 1`),
    },
    [p2UserId]: {
      elo: p2NewElo,
      rank_tier: JankenRating.getRankTier(p2NewElo),
      [p2WinKey]: trx.raw(`${p2WinKey} + 1`),
    },
  };
  for (const userId of [playerA, playerB]) {
    await trx("janken_rating").where({ user_id: userId }).update(updates[userId]);
  }

  return {
    p1EloChange,
    p2EloChange,
    p1NewElo,
    p2NewElo,
    p1RankLabel: JankenRating.getRankLabel(p1NewElo),
    p2RankLabel: JankenRating.getRankLabel(p2NewElo),
  };
}

/**
 * 連勝／懸賞（原 updateStreaks 的交易內本體）。ratings 為 ⑤ 鎖讀結果；`winnerTier` 是 Elo 更新後的
 * 段位（既有行為：懸賞上限用結算後的 tier），未給時退回鎖讀到的 rank_tier。
 */
async function applyStreaksInTransaction(
  trx,
  { p1UserId, p2UserId, p1Result, betAmount = 0, fee = 0, ratings, winnerTier }
) {
  if (p1Result === "draw" || !betAmount || betAmount <= 0) {
    return { winnerStreak: 0, loserPreviousStreak: 0, loserBounty: 0 };
  }

  const winnerId = p1Result === "win" ? p1UserId : p2UserId;
  const loserId = p1Result === "win" ? p2UserId : p1UserId;
  await ensureRatingRows(trx, [winnerId, loserId]);
  const winnerRating = ratings[winnerId];
  const loserRating = ratings[loserId];

  // Streak only grows when the winner beats a different opponent than their previous streak win.
  // This is the core anti-self-farm gate for streak/bounty: hammering the same alt account
  // keeps the streak stuck.
  const sameOpponentAsLastStreakWin =
    winnerRating.streak > 0 && winnerRating.last_won_opponent_id === loserId;
  const newStreak = sameOpponentAsLastStreakWin ? winnerRating.streak : winnerRating.streak + 1;
  const newMaxStreak = Math.max(newStreak, winnerRating.max_streak);
  // Bounty funded from match fee — no new money created
  const bountyIncrement =
    newStreak >= 2 && betAmount >= BOUNTY_MIN_BET ? exports.calculateBountyIncrement(fee) : 0;
  const maxBounty = JankenRating.getMaxBounty(winnerTier || winnerRating.rank_tier);
  const newBounty = Math.min(winnerRating.bounty + bountyIncrement, maxBounty);
  // Bounty claim capped by claimer's bet amount
  const loserBounty = Math.min(loserRating.bounty, betAmount * BOUNTY_CLAIM_MULTIPLIER);

  const updates = {
    [winnerId]: {
      streak: newStreak,
      max_streak: newMaxStreak,
      bounty: newBounty,
      last_won_opponent_id: loserId,
    },
    [loserId]: { streak: 0, bounty: 0, last_won_opponent_id: null },
  };
  for (const userId of ascending([winnerId, loserId])) {
    await trx("janken_rating").where({ user_id: userId }).update(updates[userId]);
  }

  if (loserBounty > 0) {
    await inventory.increaseGodStone({
      userId: winnerId,
      amount: loserBounty,
      note: "janken_bounty_claim",
      trx,
    });
  }

  return {
    winnerStreak: newStreak,
    winnerBounty: newBounty,
    loserPreviousStreak: loserRating.streak,
    loserBounty,
  };
}

/**
 * 單一共用結算 core。呼叫端開交易並傳入 `trx`；本函式內任何 throw 都要讓呼叫端 rollback。
 *
 * @param {import("knex").Knex.Transaction} trx
 * @param {Object} params
 * @param {String} params.matchId
 * @param {?String} [params.groupId]
 * @param {String} params.p1UserId
 * @param {String} params.p2UserId
 * @param {String} params.p1Choice
 * @param {String} params.p2Choice
 * @param {"pre_escrowed"|"inline"} params.funding
 *   pre_escrowed：手動對戰，賭金已由 escrow 扣過，core 只 payout／refund、絕不二次扣款。
 *   inline：自動配對，core 在 ③ 授權交集後於 ⑥ 鎖讀餘額決定金額並雙方 debit。
 * @param {Number} [params.betAmount=0] pre_escrowed 的固定賭金；inline 忽略
 * @param {"manual"|"arena"|"auto"} [params.source="manual"] 寫入 janken_records.source
 * @param {Object} [params.auto] inline 必填：
 *   `{ runDate, occurredAt, authorize: async ({ trx, participants }) => ({ proceed, betCandidate }) }`
 *   authorize 在 ② 之後被呼叫，負責 ③ 的鎖與 KTD12 授權交集；`betCandidate` 已是 min(雙方快照/即時 cap)，
 *   core 再交集段位上限與鎖讀餘額（餘額不進 min，任一不足即 0）。
 * @returns {Promise<Object>} 與舊 resolveMatch 相同鍵值，另加 `betAmount`（inline 實際下注額）
 */
exports.settleMatchInTransaction = async function (
  trx,
  {
    matchId,
    groupId = null,
    p1UserId,
    p2UserId,
    p1Choice,
    p2Choice,
    funding,
    betAmount = 0,
    source = "manual",
    auto = null,
  }
) {
  if (funding !== "pre_escrowed" && funding !== "inline") {
    throw new Error(`[Janken] unknown funding mode: ${funding}`);
  }
  if (funding === "inline" && (!auto || typeof auto.authorize !== "function")) {
    throw new Error("[Janken] inline funding requires auto.authorize");
  }

  const [p1Result, p2Result] = exports.determineWinner(p1Choice, p2Choice);
  const isDraw = p1Result === "draw";
  const nonBetK = config.get("minigame.janken.elo.nonBetK");

  // ① user 列 ASC
  await lockUserRows(trx, [p1UserId, p2UserId]);

  // ②③ 自動配對：participant 兩列 → authorize（subscribe_user／preference）
  let betCandidate = 0;
  if (funding === "inline") {
    const participants = await JankenAutoMatchParticipant.lockByMatchId(matchId, trx);
    const pending =
      participants.length === 2 &&
      participants.every(p => p.status === JankenAutoMatchParticipant.STATUS.NOT_STARTED);
    if (!pending) throw new SettlementError("MATCH_NOT_PENDING");
    const authorized = await auto.authorize({ trx, participants });
    if (!authorized || !authorized.proceed) {
      throw new SettlementError("AUTHORIZATION_REVOKED", authorized && authorized.reason);
    }
    betCandidate =
      Number.isSafeInteger(authorized.betCandidate) && authorized.betCandidate > 0
        ? authorized.betCandidate
        : 0;
  } else {
    betAmount = Number.isSafeInteger(betAmount) && betAmount > 0 ? betAmount : 0;
  }

  // ④⑤：只有可能動到 rating／pair_stats 時才鎖（條件同既有 updateElo／updateStreaks 的觸發條件）
  const mayBet = funding === "inline" ? betCandidate > 0 : betAmount > 0;
  const needsRating = mayBet || (!isDraw && nonBetK > 0);
  const [playerA, playerB] = orderedPair(p1UserId, p2UserId);
  let priorPairStats = null;
  let ratings = { [p1UserId]: defaultRating(p1UserId), [p2UserId]: defaultRating(p2UserId) };
  if (needsRating) {
    priorPairStats = await trx("janken_pair_stats")
      .where({ player_a: playerA, player_b: playerB })
      .forUpdate()
      .first();
    ratings = await lockRatings(trx, [p1UserId, p2UserId]);
  }

  // ⑥ inline：段位上限交集 → 鎖讀餘額（不進 min）→ 雙方 debit
  if (funding === "inline") {
    betAmount = 0;
    if (betCandidate > 0) {
      const candidate = Math.min(
        betCandidate,
        rankMaxBet(JankenRating.getRankTier(ratings[p1UserId].elo)),
        rankMaxBet(JankenRating.getRankTier(ratings[p2UserId].elo))
      );
      if (Number.isSafeInteger(candidate) && candidate > 0) {
        const balances = {};
        for (const userId of [playerA, playerB]) {
          balances[userId] = await inventory.lockGodStoneBalance(userId, trx);
        }
        if (balances[playerA] >= candidate && balances[playerB] >= candidate) {
          betAmount = candidate;
        }
      }
    }
    if (betAmount > 0) {
      for (const userId of [playerA, playerB]) {
        await inventory.decreaseGodStone({
          userId,
          amount: betAmount,
          note: "janken_auto_bet",
          trx,
        });
      }
    }
  }

  // payout／refund（pre_escrowed 的賭金已在 escrow 扣過，這裡只加不扣）
  let betFee = 0;
  if (betAmount > 0) {
    if (isDraw) {
      for (const userId of [playerA, playerB]) {
        await inventory.increaseGodStone({
          userId,
          amount: betAmount,
          note: "janken_bet_refund",
          trx,
        });
      }
    } else {
      const { winnerGets, fee } = exports.calculateBetSettlement(betAmount, "win");
      betFee = fee;
      const winnerId = p1Result === "win" ? p1UserId : p2UserId;
      await inventory.increaseGodStone({
        userId: winnerId,
        amount: winnerGets,
        note: "janken_bet_win",
        trx,
      });
    }
  }

  await JankenRecords.create(
    {
      id: matchId,
      user_id: p1UserId,
      target_user_id: p2UserId,
      group_id: groupId,
      bet_amount: betAmount,
      bet_fee: betFee,
      p1_choice: p1Choice,
      p2_choice: p2Choice,
      source,
    },
    trx
  );

  await JankenResult.insert(
    [
      { record_id: matchId, user_id: p1UserId, result: JankenResult.resultMap[p1Result] },
      { record_id: matchId, user_id: p2UserId, result: JankenResult.resultMap[p2Result] },
    ],
    trx
  );

  const eloResult = await applyEloInTransaction(trx, {
    p1UserId,
    p2UserId,
    p1Result,
    betAmount,
    ratings,
    priorPairStats,
  });
  const winnerNewElo = p1Result === "win" ? eloResult.p1NewElo : eloResult.p2NewElo;
  const streakResult = await applyStreaksInTransaction(trx, {
    p1UserId,
    p2UserId,
    p1Result,
    betAmount,
    fee: betFee,
    ratings,
    winnerTier: winnerNewElo === null ? undefined : JankenRating.getRankTier(winnerNewElo),
  });

  // Persist match details for frontend leaderboard
  const matchDetails = {};
  if (!isDraw) {
    matchDetails.elo_change = p1Result === "win" ? eloResult.p1EloChange : eloResult.p2EloChange;
  }
  if (streakResult.loserPreviousStreak > 0) {
    matchDetails.streak_broken = streakResult.loserPreviousStreak;
  }
  if (streakResult.loserBounty > 0) {
    matchDetails.bounty_won = streakResult.loserBounty;
  }
  if (Object.keys(matchDetails).length > 0) {
    await JankenRecords.update(matchId, matchDetails, trx);
  }

  // 自動配對：participant completed 與結算同 commit；成就事件只進 outbox（KTD4），不呼叫成就引擎
  if (funding === "inline") {
    const affected = await JankenAutoMatchParticipant.markCompleted(matchId, trx);
    if (affected !== 2) throw new SettlementError("PARTICIPANT_CAS_FAILED");
    if (!isDraw) {
      const winnerRole = p1Result === "win" ? "p1" : "p2";
      const winnerId = p1Result === "win" ? p1UserId : p2UserId;
      const occurredAt = auto.occurredAt || new Date();
      await JankenAutoMatchOutbox.insertEvents(
        [
          {
            match_id: matchId,
            role: winnerRole,
            event_name: "janken_win",
            run_date: auto.runDate,
            user_id: winnerId,
            occurred_at: occurredAt,
            payload: { result: "win", streak: streakResult.winnerStreak, feature: "janken" },
          },
          {
            match_id: matchId,
            role: "p2",
            event_name: "janken_challenge",
            run_date: auto.runDate,
            user_id: p2UserId,
            occurred_at: occurredAt,
            payload: { feature: "janken" },
          },
        ],
        trx
      );
    }
  }

  return {
    p1Result,
    p2Result,
    p1Choice,
    p2Choice,
    betAmount,
    betFee,
    ...eloResult,
    ...streakResult,
  };
};

/**
 * 舊 API（只剩測試與相容用途在呼叫）：自己開交易，依鎖序 ④⑤ 後套用連勝邏輯。
 */
exports.updateStreaks = async function (
  p1UserId,
  p2UserId,
  p1Result,
  { betAmount = 0, fee = 0 } = {}
) {
  if (p1Result === "draw" || !betAmount || betAmount <= 0) {
    return { winnerStreak: 0, loserPreviousStreak: 0, loserBounty: 0 };
  }
  return mysql.transaction(async trx => {
    const ratings = await lockRatings(trx, [p1UserId, p2UserId]);
    return applyStreaksInTransaction(trx, {
      p1UserId,
      p2UserId,
      p1Result,
      betAmount,
      fee,
      ratings,
    });
  });
};

/**
 * 猜拳代選判斷：若使用者開啟 auto_janken_fate 且訂閱包含該 effect，
 * 則用隨機出拳代為送出 submitChoice，並寫一筆 janken_auto_fate_log。
 * 僅用於標準對戰（duel）流程；arena 不呼叫。
 *
 * 賭注場特別處理：只有當 pref.auto_janken_fate_with_bet === 1 且 tryEscrowOnce
 * 成功把女神石押上時才代為出拳；否則拒絕 auto-fate（避免資金洩漏：被代打的人若
 * 沒有押上賭金就進入 resolveMatch，payout 會視同雙方都押但只有 p1 的石頭被扣）。
 *
 * @param {string} userId 要代打的使用者
 * @param {string} matchId 對戰 uuid
 * @param {"p1"|"p2"} role 該使用者在這場對戰的角色
 * @param {Object} ctx
 * @param {string} ctx.p1UserId
 * @param {string} ctx.p2UserId
 * @param {number} [ctx.betAmount=0] 本場賭金；>0 時需要 with_bet 子偏好 + 成功 escrow
 * @returns {Promise<{eligible:boolean, reason?:string, ready?:boolean, p1Choice?:string, p2Choice?:string, choice?:string}>}
 */
exports.autoFateIfEligible = async function (
  userId,
  matchId,
  role,
  { p1UserId, p2UserId, betAmount = 0 } = {}
) {
  const pref = await UserAutoPreference.first({ filter: { user_id: userId } });
  if (!pref || pref.auto_janken_fate !== 1) return { eligible: false, reason: "opt_out" };

  const entitled = await SubscriptionService.hasEffect(userId, "auto_janken_fate");
  if (!entitled) return { eligible: false, reason: "no_entitlement" };

  if (betAmount > 0) {
    if (pref.auto_janken_fate_with_bet !== 1) {
      return { eligible: false, reason: "bet_auto_fate_not_opted_in" };
    }
    const escrow = await exports.tryEscrowOnce(matchId, userId, betAmount);
    if (escrow.alreadyEscrowed) {
      // Bet already posted by another path — safe to proceed with auto-fate.
    } else if (!escrow.success) {
      DefaultLogger.info(
        `janken.auto_fate.skipped_insufficient_funds match_id=${matchId} user_id=${userId} bet=${betAmount}`
      );
      return { eligible: false, reason: "insufficient_funds_for_bet" };
    }
  }

  const choice = exports.randomChoice();
  await JankenAutoFateLog.create({ match_id: matchId, user_id: userId, role, choice });
  DefaultLogger.info(
    `janken.auto_fate.submit match_id=${matchId} user_id=${userId} role=${role} choice=${choice} bet=${betAmount}`
  );
  const result = await exports.submitChoice(matchId, userId, choice, { p1UserId, p2UserId });
  return { eligible: true, choice, ...result };
};

exports.submitChoice = async function (matchId, userId, choice, { p1UserId, p2UserId } = {}) {
  if (choice === "random") {
    choice = exports.randomChoice();
  }

  const key = `${REDIS_PREFIX}:${matchId}:${userId}`;
  await redis.set(key, choice, { EX: MATCH_WINDOW_SECONDS });

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
  source = "manual",
}) {
  const resolveKey = `${REDIS_PREFIX}:resolve:${matchId}`;
  const locked = await redis.set(resolveKey, "1", { EX: 60, NX: true });
  if (!locked) {
    DefaultLogger.info(`[Janken] Match ${matchId} already being resolved, skipping`);
    return null;
  }

  // 手動對戰（duel／arena）：賭金已由 escrow 扣過 → pre_escrowed。整場結算在同一交易內；
  // 交易本身失敗（含 rollback）仍要讓錯誤往外拋，呼叫端才知道這場沒有結算成功。
  const result = await mysql.transaction(trx =>
    exports.settleMatchInTransaction(trx, {
      matchId,
      groupId,
      p1UserId,
      p2UserId,
      p1Choice,
      p2Choice,
      funding: "pre_escrowed",
      betAmount,
      source,
    })
  );

  // commit 之後的 Redis 清理只是「清理」，不是結算本身；
  // `result` 已經是資金與戰績都落地的事實。任何一類副作用失敗都不能：
  //   (a) 讓另一類清理被跳過（例如 escrow zRem 失敗，choice key 清理仍要嘗試）
  //   (b) 讓呼叫端拿不到已經結算好的 `result`（controller 靠它觸發成就通知；漏掉的話玩家贏了
  //       這場但成就永遠不會補上，即使之後重跑也查不到「這場其實已經結算過」）。
  // 因此兩類效果各自獨立 catch＋log，只影響自己那組 key，不互相牽連；
  // 不論任何一類是否失敗，函式最終都回傳同一個已 commit 的 `result`。
  const postCommitEffects = [];

  if (betAmount > 0) {
    // Settled — drop both escrows from the pending set so the refund cron can't pay again.
    // Safe to do after payout: MATCH_WINDOW_SECONDS (1h) < REFUND_THRESHOLD_MS (2h), so a
    // match that is still resolvable can never be inside the cron's scan window.
    postCommitEffects.push(
      Promise.all([
        redis.zRem(PENDING_ESCROW_KEY, packEscrowMember(matchId, p1UserId, betAmount)),
        redis.zRem(PENDING_ESCROW_KEY, packEscrowMember(matchId, p2UserId, betAmount)),
      ]).catch(err => {
        DefaultLogger.error(
          `[Janken] post-commit escrow zRem failed match_id=${matchId}: ${err && err.message}`,
          err
        );
      })
    );
  }

  postCommitEffects.push(
    Promise.all([
      redis.del(`${REDIS_PREFIX}:${matchId}:${p1UserId}`),
      redis.del(`${REDIS_PREFIX}:${matchId}:${p2UserId}`),
    ]).catch(err => {
      DefaultLogger.error(
        `[Janken] post-commit choice key del failed match_id=${matchId}: ${err && err.message}`,
        err
      );
    })
  );

  await Promise.all(postCommitEffects);

  return result;
};

/**
 * 舊 API（只剩測試與相容用途在呼叫）：自己開交易，依鎖序 ④⑤ 後套用 Elo 邏輯。
 */
exports.updateElo = async function (p1UserId, p2UserId, p1Result, betAmount) {
  const zero = { p1EloChange: 0, p2EloChange: 0, p1NewElo: null, p2NewElo: null };
  const nonBetK = config.get("minigame.janken.elo.nonBetK");
  const needsRating = betAmount > 0 || (p1Result !== "draw" && nonBetK > 0);
  if (!needsRating) return zero;

  return mysql.transaction(async trx => {
    const [playerA, playerB] = orderedPair(p1UserId, p2UserId);
    const priorPairStats = await trx("janken_pair_stats")
      .where({ player_a: playerA, player_b: playerB })
      .forUpdate()
      .first();
    const ratings = await lockRatings(trx, [p1UserId, p2UserId]);
    return applyEloInTransaction(trx, {
      p1UserId,
      p2UserId,
      p1Result,
      betAmount,
      ratings,
      priorPairStats,
    });
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

/**
 * Same-pair Elo dampening factor in [0, 1].
 * Pure function of prior pair history (not including the current match).
 * Returns 1 when the pair is below the threshold or play is balanced;
 * shrinks toward 0 as the same pair plays more matches with one side dominating.
 *
 * Stats fields are pre-current-match.
 *
 * @param {{ matches?: number, a_wins?: number, b_wins?: number }} stats
 * @returns {number}
 */
exports.calculatePairDampening = function ({ matches = 0, a_wins = 0, b_wins = 0 } = {}) {
  if (matches < PAIR_DAMP_THRESHOLD) return 1;
  const decided = a_wins + b_wins;
  if (decided === 0) return 1;
  const winRate = Math.max(a_wins, b_wins) / decided;
  const winRateBias = Math.max(0, winRate * 2 - 1); // 0.5 → 0, 1.0 → 1.0
  return 1 / (1 + matches * PAIR_DAMP_BIAS_MULTIPLIER * winRateBias);
};

exports.calculateEloChange = function (
  myElo,
  opponentElo,
  result,
  betAmount,
  { streak = 0, pairDampening = 1 } = {}
) {
  if (result === "draw") return 0;
  let K;
  if (!betAmount || betAmount <= 0) {
    const nonBetK = config.get("minigame.janken.elo.nonBetK");
    if (!nonBetK || nonBetK <= 0) return 0;
    K = nonBetK;
  } else {
    K = JankenRating.getKFactor(betAmount);
  }
  const expected = exports.calculateExpectedWinRate(myElo, opponentElo);
  const actual = result === "win" ? 1 : 0;
  const raw = K * (actual - expected);
  if (raw >= 0) {
    const multiplier = result === "win" ? exports.getStreakMultiplier(streak) : 1;
    return Math.floor(raw * multiplier * pairDampening);
  }
  const lossFactor = config.get("minigame.janken.elo.lossFactor");
  return Math.ceil(raw * lossFactor * pairDampening);
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
