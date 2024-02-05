/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable("minigame_job", table => {
    table.increments("id").primary();
    table.string("key").notNullable().unique();
    table.string("name").notNullable();
    table.string("description").notNullable().comment("職業描述");
    table.integer("class_advancement").notNullable().comment("轉職位階");

    table.timestamps(true, true);
  });

  return knex
    .insert([
      {
        key: "adventurer",
        name: "冒險者",
        description: "冒險者",
        class_advancement: 0,
      },
      {
        key: "swordman",
        name: "劍士",
        description: "劍士是近戰專家，以高生命值和防禦力為優勢，擅長在前線與敵人近距離交戰。",
        class_advancement: 1,
      },
      {
        key: "thief",
        name: "盜賊",
        description: "盜賊以靈活性和隱密行動為優勢，能夠在戰場上迅速移動，進行偷襲和情報收集。",
        class_advancement: 1,
      },
      {
        key: "mage",
        name: "法師",
        description: "法師是遠距離攻擊者，以元素和魔法為主，雖然生命值較低，但擁有強大的法術威力。",
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
