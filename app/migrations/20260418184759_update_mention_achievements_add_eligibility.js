// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const KEYS = ["mention_admin_hi", "mention_memory_seeker", "mention_void_gazer"];

function parseCondition(raw) {
  if (!raw) return {};
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  for (const key of KEYS) {
    const row = await knex("achievements").where({ key }).first();
    if (!row) continue;
    const cond = parseCondition(row.condition);
    const tagged = Array.isArray(cond.targetUserIds) ? cond.targetUserIds : [];
    const next = {
      mentionTargetUserIds: tagged,
      keywords: Array.isArray(cond.keywords) ? cond.keywords : [],
      eligibility: { excludeUserIds: tagged },
    };
    await knex("achievements")
      .where({ key })
      .update({ condition: JSON.stringify(next) });
  }
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  for (const key of KEYS) {
    const row = await knex("achievements").where({ key }).first();
    if (!row) continue;
    const cond = parseCondition(row.condition);
    const tagged = Array.isArray(cond.mentionTargetUserIds) ? cond.mentionTargetUserIds : [];
    const prev = {
      targetUserIds: tagged,
      keywords: Array.isArray(cond.keywords) ? cond.keywords : [],
    };
    await knex("achievements")
      .where({ key })
      .update({ condition: JSON.stringify(prev) });
  }
};
