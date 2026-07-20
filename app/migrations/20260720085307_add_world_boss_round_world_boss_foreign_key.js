const TABLE = "world_boss_round";
const INDEX = "idx_wbr_world_boss";
const FOREIGN_KEY = "fk_wbr_world_boss";
const ORPHAN_SAMPLE_LIMIT = 10;

function orphanError(orphanCount, orphanSample) {
  const error = new Error(
    `WORLD_BOSS_ROUND_ORPHANS: count=${orphanCount}; sample=${orphanSample
      .map(orphan => `round_id=${orphan.roundId}/world_boss_id=${orphan.worldBossId}`)
      .join(",")}`
  );
  error.code = "WORLD_BOSS_ROUND_ORPHANS";
  error.orphanCount = orphanCount;
  error.orphanSample = orphanSample;
  return error;
}

exports.up = async function (knex) {
  const orphans = await knex(`${TABLE} as round`)
    .leftJoin("world_boss as boss", "round.world_boss_id", "boss.id")
    .whereNull("boss.id")
    .orderBy("round.id", "asc")
    .limit(ORPHAN_SAMPLE_LIMIT)
    .select(
      "round.id as roundId",
      "round.world_boss_id as worldBossId",
      knex.raw("COUNT(*) OVER() as orphanCount")
    );

  if (orphans.length) {
    const orphanCount = Number(orphans[0].orphanCount);
    const orphanSample = orphans.map(({ roundId, worldBossId }) => ({ roundId, worldBossId }));
    throw orphanError(orphanCount, orphanSample);
  }

  await knex.schema.alterTable(TABLE, table => {
    table.index(["world_boss_id"], INDEX);
  });
  await knex.schema.alterTable(TABLE, table => {
    table
      .foreign("world_boss_id", FOREIGN_KEY)
      .references("id")
      .inTable("world_boss")
      .onDelete("RESTRICT");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable(TABLE, table => {
    table.dropForeign(["world_boss_id"], FOREIGN_KEY);
  });
  await knex.schema.alterTable(TABLE, table => {
    table.dropIndex(["world_boss_id"], INDEX);
  });
};
