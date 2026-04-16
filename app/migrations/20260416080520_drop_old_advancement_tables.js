// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  // Step 1: Find the "創世見證者" achievement
  const legacyAchievement = await knex("achievements").where({ key: "legacy_pioneer" }).first();

  if (legacyAchievement) {
    // Step 2: Get all old users' platform_ids who had any achievement
    const oldUsers = await knex("user_has_advancements")
      .join("user", "user_has_advancements.user_id", "user.id")
      .distinct("user.platform_id")
      .select("user.platform_id");

    // Step 3: Award "創世見證者" to all old users
    if (oldUsers.length > 0) {
      const records = oldUsers.map(u => ({
        user_id: u.platform_id,
        achievement_id: legacyAchievement.id,
      }));

      // Batch insert in chunks to avoid query size limits
      const CHUNK_SIZE = 500;
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        await knex("user_achievements")
          .insert(chunk)
          .onConflict(["user_id", "achievement_id"])
          .ignore();
      }

      console.log(`Awarded "創世見證者" to ${oldUsers.length} legacy users`);
    }
  }

  // Step 4: Drop old tables
  await knex.schema.dropTableIfExists("user_has_advancements");
  await knex.schema.dropTableIfExists("advancement");
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.createTable("advancement", table => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("type").notNullable();
    table.string("description").notNullable();
    table.string("icon").notNullable();
    table.tinyint("order").notNullable();
    table.timestamps(true, true);
    table.index("name");
    table.unique(["name", "type"]);
  });
  await knex.schema.createTable("user_has_advancements", table => {
    table.increments("id").primary();
    table.integer("user_id").notNullable();
    table.integer("advancement_id").notNullable();
    table.timestamps(true, true);
    table.unique(["user_id", "advancement_id"]);
    table.index("user_id");
  });

  // Remove legacy_pioneer unlocks (can't restore old data)
  const legacyAchievement = await knex("achievements").where({ key: "legacy_pioneer" }).first();
  if (legacyAchievement) {
    await knex("user_achievements").where({ achievement_id: legacyAchievement.id }).delete();
  }
};
