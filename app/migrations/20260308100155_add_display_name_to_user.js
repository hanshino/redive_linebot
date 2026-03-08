exports.up = function (knex) {
  return knex.schema.alterTable("User", table => {
    table.string("display_name", 100).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("User", table => {
    table.dropColumn("display_name");
  });
};
