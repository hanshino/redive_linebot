exports.up = function (knex) {
  return knex.schema.alterTable("janken_records", table => {
    table.string("group_id", 33).after("target_user_id");
    table.integer("bet_amount").notNullable().defaultTo(0);
    table.integer("bet_fee").notNullable().defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("janken_records", table => {
    table.dropColumn("group_id");
    table.dropColumn("bet_amount");
    table.dropColumn("bet_fee");
  });
};
