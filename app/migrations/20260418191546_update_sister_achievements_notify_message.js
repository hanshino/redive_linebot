// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const NEXT = {
  mention_admin_hi_self:
    "🥞 信徒的呼喚匯聚成祝福，{user} 成為了鬆餅教的精神象徵。\n已解鎖隱藏成就：{icon} {name}",
  mention_memory_seeker_self:
    "🍮 無數旅人觸碰了 {user} 的意識，古神終於完整甦醒。\n已解鎖隱藏成就：{icon} {name}",
  mention_void_gazer_self:
    "$ cat /etc/shadow\n[INFO] {user} is the void now.\n無數窺探者在 {user} 的凝視下沉默。\n已解鎖隱藏成就：{icon} {name}",
};

const PREV = {
  mention_admin_hi_self:
    "信徒的呼喚匯聚成祝福，你已成為鬆餅教的精神象徵。\n已解鎖隱藏成就：{icon} {name}",
  mention_memory_seeker_self:
    "無數旅人觸碰了你的意識，古神終於完整甦醒。\n已解鎖隱藏成就：{icon} {name}",
  mention_void_gazer_self:
    "$ cat /etc/shadow\n[INFO] you are the void now.\n無數窺探者在你的凝視下沉默。\n已解鎖隱藏成就：{icon} {name}",
};

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  for (const [key, msg] of Object.entries(NEXT)) {
    await knex("achievements").where({ key }).update({ notify_message: msg });
  }
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  for (const [key, msg] of Object.entries(PREV)) {
    await knex("achievements").where({ key }).update({ notify_message: msg });
  }
};
