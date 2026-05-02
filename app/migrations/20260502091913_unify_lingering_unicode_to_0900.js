/**
 * Self-healing collation drift fix.
 *
 * 20260327_unify_all_collation_to_0900.js converted a known list of legacy
 * tables to utf8mb4_0900_ai_ci, but environments restored from older dumps
 * (or tables created since by other branches) can drift back to unicode_ci,
 * which breaks JOINs against the newer janken / season tables with
 * ER_CANT_AGGREGATE_2COLLATIONS.
 *
 * Rescans information_schema for any base tables in the current database
 * still on a *_unicode_ci collation and converts them. CONVERT TO CHARACTER
 * SET is idempotent, so running on an already-clean DB is a no-op.
 */

exports.up = async function (knex) {
  const [rows] = await knex.raw(
    `SELECT TABLE_NAME
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
        AND TABLE_COLLATION LIKE 'utf8mb4_unicode_ci%'`
  );

  if (!rows || rows.length === 0) {
    console.log("[unify_lingering_unicode_to_0900] no drift detected — skipping.");
    return;
  }

  const names = rows.map(r => r.TABLE_NAME);
  console.log(
    `[unify_lingering_unicode_to_0900] converting ${names.length} table(s): ${names.join(", ")}`
  );

  for (const name of names) {
    await knex.raw(
      `ALTER TABLE \`${name}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
  }
};

exports.down = async function () {
  // Intentional no-op: we cannot know which tables the up step touched in a
  // given environment, and rolling string columns back to unicode_ci would
  // re-introduce the collation mismatch this migration exists to fix.
  // Use 20260327_unify_all_collation_to_0900.js's down for explicit rollback.
};
