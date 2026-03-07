exports.up = function (knex) {
  return knex.schema.createTable("janken_rating", table => {
    table.string("user_id", 33).primary();
    table.integer("elo").notNullable().defaultTo(1000);
    table.string("rank_tier", 20).notNullable().defaultTo("beginner");
    table.integer("win_count").notNullable().defaultTo(0);
    table.integer("lose_count").notNullable().defaultTo(0);
    table.integer("draw_count").notNullable().defaultTo(0);
    table.integer("streak").notNullable().defaultTo(0);
    table.integer("max_streak").notNullable().defaultTo(0);
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("janken_rating");
};
