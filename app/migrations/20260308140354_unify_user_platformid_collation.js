/**
 * Unify User.platformId collation to utf8mb4_0900_ai_ci
 * to match janken_records/janken_rating/janken_result tables.
 *
 * This eliminates the need for COLLATE overrides in JOIN queries,
 * allowing MySQL to use indexes instead of creating temp tables.
 */
exports.up = function (knex) {
  return knex.raw(
    "ALTER TABLE `User` MODIFY `platformId` VARCHAR(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL"
  );
};

exports.down = function (knex) {
  return knex.raw(
    "ALTER TABLE `User` MODIFY `platformId` VARCHAR(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL"
  );
};
