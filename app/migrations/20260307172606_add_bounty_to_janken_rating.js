exports.up = function (knex) {
  return knex.schema.alterTable("janken_rating", table => {
    table.integer("bounty").notNullable().defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("janken_rating", table => {
    table.dropColumn("bounty");
  });
};
