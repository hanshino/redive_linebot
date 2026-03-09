/**
 * Add UNIQUE constraint to User.platformId to prevent duplicate user records.
 * First cleans up any existing duplicates (keeps the row with the smallest No).
 */
exports.up = async function (knex) {
  // Remove duplicate rows, keeping the one with the smallest No
  await knex.raw(`
    DELETE u FROM \`User\` u
    INNER JOIN (
      SELECT platformId, MIN(No) as keep_id
      FROM \`User\`
      GROUP BY platformId
      HAVING COUNT(*) > 1
    ) dup ON u.platformId = dup.platformId AND u.No != dup.keep_id
  `);

  // Check which index exists and drop it
  const [indexes] = await knex.raw("SHOW INDEX FROM `User` WHERE Column_name = 'platformId'");
  const indexNames = [...new Set(indexes.map(i => i.Key_name))];

  for (const name of indexNames) {
    await knex.raw("ALTER TABLE `User` DROP INDEX `" + name + "`");
  }

  // Add unique constraint on platformId only
  await knex.schema.alterTable("User", table => {
    table.unique("platformId");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("User", table => {
    table.dropUnique("platformId");
    table.index("platformId", "idx_platformId");
  });
};
