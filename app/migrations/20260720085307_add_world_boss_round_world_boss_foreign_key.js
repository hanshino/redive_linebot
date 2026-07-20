const TABLE = "world_boss_round";
const INDEX = "idx_wbr_world_boss";
const FOREIGN_KEY = "world_boss_round_world_boss_id_foreign";

exports.up = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.index(["world_boss_id"], INDEX);
    table
      .foreign("world_boss_id", FOREIGN_KEY)
      .references("id")
      .inTable("world_boss")
      .onDelete("RESTRICT");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.dropForeign(["world_boss_id"], FOREIGN_KEY);
    table.dropIndex(["world_boss_id"], INDEX);
  });
};
