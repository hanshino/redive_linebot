exports.up = function (knex) {
  return knex.schema.alterTable("janken_records", table => {
    table.string("p1_choice", 10).nullable();
    table.string("p2_choice", 10).nullable();
    table.integer("elo_change").nullable();
    table.integer("streak_broken").nullable();
    table.integer("bounty_won").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("janken_records", table => {
    table.dropColumn("p1_choice");
    table.dropColumn("p2_choice");
    table.dropColumn("elo_change");
    table.dropColumn("streak_broken");
    table.dropColumn("bounty_won");
  });
};
