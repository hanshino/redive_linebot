const Base = require("../base");

const TABLE = "chat_exp_events";
const fillable = [
  "user_id",
  "group_id",
  "ts",
  "raw_exp",
  "effective_exp",
  "cooldown_rate",
  "group_bonus",
  "modifiers",
  "base_xp",
  "blessing1_mult",
  "honeymoon_mult",
  "diminish_factor",
  "trial_mult",
  "permanent_mult",
];

class ChatExpEvent extends Base {}

const model = new ChatExpEvent({ table: TABLE, fillable });

exports.model = model;

/**
 * 寫入一筆事件。modifiers 會自動 JSON.stringify。
 * @param {object} params
 */
exports.insertEvent = params => {
  const payload = { ...params };
  if (payload.modifiers && typeof payload.modifiers !== "string") {
    payload.modifiers = JSON.stringify(payload.modifiers);
  }
  return model.create(payload);
};

exports.findInRange = ({ userId, from, to, limit = 1000, beforeId = null, beforeTs = null }) => {
  let q = model.knex
    .where({ user_id: userId })
    .andWhere("ts", ">=", `${from} 00:00:00`)
    .andWhere("ts", "<", `${to} 23:59:59.999`)
    .orderBy("ts", "desc")
    .orderBy("id", "desc")
    .limit(limit);

  if (beforeTs && beforeId) {
    q = q.andWhere(builder => {
      builder
        .where("ts", "<", beforeTs)
        .orWhere(b2 => b2.where("ts", "=", beforeTs).andWhere("id", "<", beforeId));
    });
  }
  return q;
};

exports.findLatestByUser = userId =>
  model.knex
    .where({ user_id: userId })
    .orderBy("ts", "desc")
    .orderBy("id", "desc")
    .limit(1)
    .first();
