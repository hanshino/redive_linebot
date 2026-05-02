const mysql = require("../../util/mysql");
const { pick } = require("lodash");
const config = require("config");

const TABLE = "janken_rating";
const fillable = [
  "user_id",
  "elo",
  "rank_tier",
  "win_count",
  "lose_count",
  "draw_count",
  "streak",
  "max_streak",
  "bounty",
  "lifetime_win_count",
  "lifetime_lose_count",
  "lifetime_draw_count",
];

const FALLBACK_TIERS = [
  { key: "beginner", name: "見習者", minElo: 0 },
  { key: "challenger", name: "挑戰者", minElo: 1100 },
  { key: "fighter", name: "強者", minElo: 1250 },
  { key: "master", name: "達人", minElo: 1400 },
  { key: "legend", name: "傳說", minElo: 1550 },
];

function getTiers() {
  try {
    const tiers = config.get("minigame.janken.elo.tiers");
    if (Array.isArray(tiers) && tiers.length > 0) return tiers;
  } catch {
    /* config miss → fallback */
  }
  return FALLBACK_TIERS;
}

exports.getRankTier = function (elo) {
  const tiers = getTiers();
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (elo >= tiers[i].minElo) return tiers[i].key;
  }
  return "beginner";
};

exports.getRankInfo = function (elo) {
  const tiers = getTiers();
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (elo >= tiers[i].minElo) return tiers[i];
  }
  return tiers[0];
};

exports.getSubTier = function (elo) {
  const tier = exports.getRankInfo(elo);
  const initialElo = config.get("minigame.janken.elo.initial");
  const base = Math.max(tier.minElo, initialElo);
  const offset = Math.max(0, elo - base);
  return 5 - Math.min(4, Math.floor(offset / 40));
};

exports.getRankLabel = function (elo) {
  const tier = exports.getRankInfo(elo);
  const subTier = exports.getSubTier(elo);
  return `${tier.name} ${subTier}`;
};

exports.getKFactor = function (betAmount) {
  const tiers = config.get("minigame.janken.elo.kFactorTiers");
  for (const tier of tiers) {
    if (betAmount >= tier.minBet) return tier.k;
  }
  return 2;
};

exports.getNextTierElo = function (elo) {
  const tiers = getTiers();
  const currentKey = exports.getRankTier(elo);
  const idx = tiers.findIndex(t => t.key === currentKey);
  if (idx >= tiers.length - 1) return null;
  return tiers[idx + 1].minElo;
};

exports.getRankImageKey = function (elo) {
  return `rank_${exports.getRankTier(elo)}`;
};

exports.getServerRank = async function (userId) {
  const result = await mysql.raw(
    `SELECT COUNT(*) + 1 AS rank_position FROM ${TABLE} WHERE elo > (SELECT elo FROM ${TABLE} WHERE user_id = ?)`,
    [userId]
  );
  const rows = result[0] || [];
  return (rows[0] && rows[0].rank_position) || 1;
};

exports.getMaxBet = function (rankTier) {
  const maxByRank = config.get("minigame.janken.bet.maxAmountByRank");
  return maxByRank[rankTier] || maxByRank.beginner;
};

exports.getMaxBounty = function (rankTier) {
  const maxByRank = config.get("minigame.janken.streak.maxBountyByRank");
  return maxByRank[rankTier] || maxByRank.beginner;
};

exports.find = async function (userId) {
  return mysql(TABLE).where({ user_id: userId }).first();
};

exports.findOrCreate = async function (userId, trx) {
  const db = trx || mysql;
  let rating = await db(TABLE).where({ user_id: userId }).first();
  if (!rating) {
    await db.raw(
      `INSERT INTO \`${TABLE}\` (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id`,
      [userId]
    );
    rating = await db(TABLE).where({ user_id: userId }).first();
  }
  return rating;
};

exports.update = async function (userId, attributes) {
  const data = pick(attributes, fillable);
  return mysql(TABLE).where({ user_id: userId }).update(data);
};

exports.getTopRankings = async function (limit = 20) {
  const subquery = mysql("user")
    .select("platform_id")
    .max("display_name as display_name")
    .groupBy("platform_id")
    .as("u");

  return mysql(TABLE)
    .select(`${TABLE}.*`, "u.display_name")
    .leftJoin(subquery, "u.platform_id", "=", `${TABLE}.user_id`)
    .orderBy("elo", "desc")
    .limit(limit);
};

exports.getTopByElo = async function (limit = 50, trx) {
  const db = trx || mysql;
  return db(TABLE).orderBy("elo", "desc").orderBy("win_count", "desc").limit(limit);
};

exports.resetSeasonFields = async function (trx) {
  const db = trx || mysql;
  return db(TABLE).update({
    lifetime_win_count: db.raw("lifetime_win_count + win_count"),
    lifetime_lose_count: db.raw("lifetime_lose_count + lose_count"),
    lifetime_draw_count: db.raw("lifetime_draw_count + draw_count"),
    elo: 1000,
    rank_tier: "beginner",
    win_count: 0,
    lose_count: 0,
    draw_count: 0,
    streak: 0,
    bounty: 0,
  });
};
