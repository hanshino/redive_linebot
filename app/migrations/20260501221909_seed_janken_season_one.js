/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const existing = await knex("janken_seasons").first();
  if (existing) return;

  const oldest = await knex("janken_records").min({ ts: "created_at" }).first();
  const startedAt = (oldest && oldest.ts) || new Date();

  await knex("janken_seasons").insert({
    id: 1,
    started_at: startedAt,
    status: "active",
    notes: "v1 retroactive — first season",
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex("janken_seasons").where({ id: 1 }).delete();
};
