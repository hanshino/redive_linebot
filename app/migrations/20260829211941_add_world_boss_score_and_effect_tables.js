// NOT EXISTS makes the legacy backfill idempotent. Re-run it after deployment if
// contributions arrive during the migration-to-release gap.
const BACKFILL_LEGACY_DIRECT_SQL = `
INSERT INTO world_boss_score_event
  (season_id, round_id, contribution_id, effect_id, beneficiary_user_id, kind, points, created_at, updated_at)
SELECT c.season_id, c.round_id, c.id, NULL, c.user_id, 'direct', c.damage, c.created_at, c.updated_at
FROM world_boss_contribution c
WHERE c.damage > 0
  AND NOT EXISTS (
    SELECT 1 FROM world_boss_score_event e
    WHERE e.contribution_id = c.id
      AND e.kind = 'direct'
      AND e.beneficiary_user_id = c.user_id
  );
`;

exports.BACKFILL_LEGACY_DIRECT_SQL = BACKFILL_LEGACY_DIRECT_SQL;

exports.up = async knex => {
  await knex.schema.alterTable("world_boss_contribution", table => {
    table.bigInteger("raw_damage").unsigned().nullable();
    table.bigInteger("effect_damage").unsigned().notNullable().defaultTo(0);
    table.string("job_key", 32).nullable();
  });
  await knex.schema.alterTable("world_boss_season_reward", table => {
    table.bigInteger("total_score").unsigned().nullable();
  });

  await knex.schema.createTable("world_boss_round_effect", table => {
    table.bigIncrements("id").primary();
    table.bigInteger("season_id").unsigned().notNullable();
    table.bigInteger("round_id").unsigned().notNullable();
    table.bigInteger("source_contribution_id").unsigned().notNullable();
    table.string("source_user_id", 33).notNullable();
    table.string("effect_type", 16).notNullable();
    table.bigInteger("value").unsigned().notNullable();
    table.bigInteger("consumed_by_contribution_id").unsigned().nullable();
    table.timestamps(true, true);
    table.unique(["source_contribution_id"], "uq_wbre_source_contribution");
    table.unique(["consumed_by_contribution_id"], "uq_wbre_consumed_contribution");
    table.index(["round_id", "consumed_by_contribution_id", "id"], "idx_wbre_round_consumed_id");
    table.index(["season_id", "source_user_id"], "idx_wbre_season_source_user");
    table
      .foreign("season_id", "fk_wbre_season")
      .references("id")
      .inTable("world_boss_season")
      .onDelete("RESTRICT");
    table
      .foreign("round_id", "fk_wbre_round")
      .references("id")
      .inTable("world_boss_round")
      .onDelete("RESTRICT");
    table
      .foreign("source_contribution_id", "fk_wbre_source_contribution")
      .references("id")
      .inTable("world_boss_contribution")
      .onDelete("RESTRICT");
    table
      .foreign("consumed_by_contribution_id", "fk_wbre_consumed_contribution")
      .references("id")
      .inTable("world_boss_contribution")
      .onDelete("RESTRICT");
    table.check("?? > 0", ["value"], "chk_wbre_value_positive");
  });

  await knex.schema.createTable("world_boss_score_event", table => {
    table.bigIncrements("id").primary();
    table.bigInteger("season_id").unsigned().notNullable();
    table.bigInteger("round_id").unsigned().notNullable();
    table.bigInteger("contribution_id").unsigned().notNullable();
    table.bigInteger("effect_id").unsigned().nullable();
    table.string("beneficiary_user_id", 33).notNullable();
    table.string("kind", 16).notNullable();
    table.bigInteger("points").unsigned().notNullable();
    table.timestamps(true, true);
    table.unique(
      ["contribution_id", "kind", "beneficiary_user_id"],
      "uq_wbse_contribution_kind_user"
    );
    table.unique(["effect_id", "kind", "beneficiary_user_id"], "uq_wbse_effect_kind_user");
    table.index(["season_id", "beneficiary_user_id"], "idx_wbse_season_beneficiary");
    table.index(["round_id"], "idx_wbse_round");
    table.index(["contribution_id"], "idx_wbse_contribution");
    table
      .foreign("season_id", "fk_wbse_season")
      .references("id")
      .inTable("world_boss_season")
      .onDelete("RESTRICT");
    table
      .foreign("round_id", "fk_wbse_round")
      .references("id")
      .inTable("world_boss_round")
      .onDelete("RESTRICT");
    table
      .foreign("contribution_id", "fk_wbse_contribution")
      .references("id")
      .inTable("world_boss_contribution")
      .onDelete("RESTRICT");
    table
      .foreign("effect_id", "fk_wbse_effect")
      .references("id")
      .inTable("world_boss_round_effect")
      .onDelete("RESTRICT");
    table.check("?? > 0", ["points"], "chk_wbse_points_positive");
  });

  await knex.raw(BACKFILL_LEGACY_DIRECT_SQL);
};

exports.down = async knex => {
  // Do not run in production after v2 data exists; local round-trip tests only.
  await knex.schema.dropTableIfExists("world_boss_score_event");
  await knex.schema.dropTableIfExists("world_boss_round_effect");
  await knex.schema.alterTable("world_boss_season_reward", table => {
    table.dropColumn("total_score");
  });
  await knex.schema.alterTable("world_boss_contribution", table => {
    table.dropColumn("raw_damage");
    table.dropColumn("effect_damage");
    table.dropColumn("job_key");
  });
};
