exports.up = function (knex) {
  return knex.schema.table("Guild", function (table) {
    table.string("name").nullable().comment("戰隊名稱").after("GuildId");
    table.string("uid", 10).nullable().comment("戰隊長的uid").after("GuildId");
  });
};

exports.down = function (knex) {
  return knex.schema.table("Guild", function (table) {
    table.dropColumns(["uid", "name"]);
  });
};
