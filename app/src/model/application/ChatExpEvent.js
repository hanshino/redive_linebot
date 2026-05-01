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
