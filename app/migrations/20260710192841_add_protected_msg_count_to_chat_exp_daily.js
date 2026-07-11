// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const TABLE = "chat_exp_daily";

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable(TABLE, table => {
    table
      .integer("protected_msg_count")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .after("msg_count")
      .comment("messages sent while weather protection was active (debuff neutralised)");
  });

  // Backfill from per-event ground truth (chat_exp_events.weather_protected).
  // ts is stored UTC; the daily bucket is UTC+8, so shift +8h before bucketing.
  // Only days with protected events are touched; the rest keep the 0 default.
  await knex.raw(
    `UPDATE ${TABLE} d
     JOIN (
       SELECT user_id, DATE(ts + INTERVAL 8 HOUR) AS d8, COUNT(*) AS pc
       FROM chat_exp_events
       WHERE weather_protected = 1
       GROUP BY user_id, DATE(ts + INTERVAL 8 HOUR)
     ) e ON e.user_id = d.user_id AND e.d8 = d.date
     SET d.protected_msg_count = e.pc`
  );
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.dropColumn("protected_msg_count");
  });
};
