/**
 * Add indexes for JOIN performance on User.platformId and janken_records foreign keys.
 * These indexes allow MySQL to use index lookups instead of full table scans.
 */
exports.up = async function (knex) {
  // User.platformId - used in JOINs with janken_records and janken_rating
  const [userIdx] = await knex.raw(
    "SELECT COUNT(*) as cnt FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'User' AND column_name = 'platformId'"
  );
  if (userIdx[0].cnt === 0) {
    await knex.raw("ALTER TABLE `User` ADD INDEX `idx_platformId` (`platformId`)");
  }

  // janken_records.user_id - used in JOINs with User
  const [recUserIdx] = await knex.raw(
    "SELECT COUNT(*) as cnt FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'janken_records' AND index_name = 'idx_user_id'"
  );
  if (recUserIdx[0].cnt === 0) {
    await knex.raw("ALTER TABLE `janken_records` ADD INDEX `idx_user_id` (`user_id`)");
  }

  // janken_records.target_user_id - used in JOINs with User
  const [recTargetIdx] = await knex.raw(
    "SELECT COUNT(*) as cnt FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'janken_records' AND index_name = 'idx_target_user_id'"
  );
  if (recTargetIdx[0].cnt === 0) {
    await knex.raw(
      "ALTER TABLE `janken_records` ADD INDEX `idx_target_user_id` (`target_user_id`)"
    );
  }
};

exports.down = async function (knex) {
  await knex.raw("ALTER TABLE `User` DROP INDEX `idx_platformId`");
  await knex.raw("ALTER TABLE `janken_records` DROP INDEX `idx_user_id`");
  await knex.raw("ALTER TABLE `janken_records` DROP INDEX `idx_target_user_id`");
};
