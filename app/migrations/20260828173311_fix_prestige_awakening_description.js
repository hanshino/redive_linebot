// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * `prestige_awakening` is awarded by PrestigeService when a user passes the ★5
 * trial (prestige_trials.reward_meta.achievement_slug), NOT when they reach
 * prestige_count = 5. Its seeded description claimed both:
 *
 *   通過 ★5 覺悟試煉,達成覺醒終態
 *
 * As of 2026-08 that second clause is false for 53 of the 55 holders — only 2
 * users have actually awakened. Nobody could see the text before, because
 * `description` was never rendered; the achievement detail sheet now shows it
 * to whoever unlocked the achievement, so the claim has to be true.
 *
 * Rewritten to state only what the achievement really certifies, reusing the
 * reward's own name (PrestigeService.js `覺醒之證`). A separate achievement for
 * the actual prestige_count = 5 terminal state does not exist yet.
 *
 * The half-width comma on both prestige rows is fixed in the same pass.
 */
const REWRITES = [
  {
    key: "prestige_departure",
    from: "通過 ★1 啟程試煉,踏上轉生之路",
    to: "通過 ★1 啟程試煉，踏上轉生之路",
  },
  {
    key: "prestige_awakening",
    from: "通過 ★5 覺悟試煉,達成覺醒終態",
    to: "通過 ★5 覺悟試煉，取得覺醒之證",
  },
];

// Matching on the expected current text keeps this a no-op if the row was
// already edited by hand on production, instead of clobbering that edit.
const apply = (knex, direction) =>
  Promise.all(
    REWRITES.map(r =>
      knex("achievements")
        .where({ key: r.key, description: direction === "up" ? r.from : r.to })
        .update({ description: direction === "up" ? r.to : r.from })
    )
  );

/**
 * @param {Knex} knex
 */
exports.up = knex => apply(knex, "up");

/**
 * @param {Knex} knex
 */
exports.down = knex => apply(knex, "down");
