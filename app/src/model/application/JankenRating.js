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
];

const RANK_TIERS = [
  { key: "beginner", name: "見習者", minElo: 0 },
  { key: "challenger", name: "挑戰者", minElo: 1200 },
  { key: "fighter", name: "強者", minElo: 1400 },
  { key: "master", name: "達人", minElo: 1600 },
  { key: "legend", name: "傳說", minElo: 1800 },
];

exports.RANK_TIERS = RANK_TIERS;

exports.getRankTier = function (elo) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANK_TIERS[i].minElo) return RANK_TIERS[i].key;
  }
  return "beginner";
};

exports.getRankInfo = function (elo) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANK_TIERS[i].minElo) return RANK_TIERS[i];
  }
  return RANK_TIERS[0];
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
  const currentKey = exports.getRankTier(elo);
  const idx = RANK_TIERS.findIndex(t => t.key === currentKey);
  if (idx >= RANK_TIERS.length - 1) return null;
  return RANK_TIERS[idx + 1].minElo;
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
  return mysql(TABLE)
    .select(`${TABLE}.*`, "User.display_name")
    .join("User", "User.platformId", `${TABLE}.user_id`)
    .orderBy("elo", "desc")
    .limit(limit);
};
