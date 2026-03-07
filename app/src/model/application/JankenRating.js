const mysql = require("../../util/mysql");
const { pick } = require("lodash");
const config = require("config");

const TABLE = "janken_rating";
const fillable = ["user_id", "elo", "rank_tier", "win_count", "lose_count", "draw_count", "streak", "max_streak", "bounty"];

const RANK_TIERS = [
  { name: "beginner", minElo: 0 },
  { name: "challenger", minElo: 1200 },
  { name: "fighter", minElo: 1400 },
  { name: "master", minElo: 1600 },
  { name: "legend", minElo: 1800 },
];

exports.RANK_TIERS = RANK_TIERS;

exports.getRankTier = function (elo) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANK_TIERS[i].minElo) return RANK_TIERS[i].name;
  }
  return "beginner";
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
