/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .table("Inventory", table => {
      table.json("attributes").after("itemAmount");
    })
    .then(() =>
      knex.raw(`
        UPDATE \`Inventory\` i
        JOIN \`GachaPool\` g ON i.\`itemId\` = g.\`ID\`
        SET i.\`attributes\` = JSON_SET(COALESCE(i.\`attributes\`, '[]'), '$[0]', JSON_OBJECT('key', 'star', 'value', CAST(g.\`Star\` AS UNSIGNED)))
        WHERE g.\`Star\` IS NOT NULL;
      `)
    );
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("Inventory", table => {
    table.dropColumn("attributes");
  });
};
