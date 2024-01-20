/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("minigame_job", table => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("description").notNullable().comment("職業描述");
    table.integer("class_advancement").notNullable().comment("轉職位階");

    table.timestamps(true, true);
  });

  return knex
    .insert([
      {
        name: "冒險者",
        description: "冒險者",
        class_advancement: 0,
      },
      {
        name: "戰士",
        description: "戰士",
        class_advancement: 1,
      },
      {
        name: "盜賊",
        description: "盜賊",
        class_advancement: 1,
      },
      {
        name: "法師",
        description: "法師",
        class_advancement: 1,
      },
    ])
    .into("minigame_job");
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("minigame_job");
};
