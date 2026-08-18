const TABLE = "world_boss_season_boss";
const REFERENCED_TABLE = "world_boss";
const COLUMN = "world_boss_id";
const REFERENCED_COLUMN = "id";
const INDEX = "idx_wbsb_world_boss";
const FOREIGN_KEY = "fk_wbsb_world_boss";
const ORPHAN_SAMPLE_LIMIT = 10;

function orphanError(orphanCount, orphanSample) {
  const error = new Error(
    `WORLD_BOSS_SEASON_BOSS_ORPHANS: count=${orphanCount}; sample=${orphanSample
      .map(orphan => `season_boss_id=${orphan.seasonBossId}/world_boss_id=${orphan.worldBossId}`)
      .join(",")}`
  );
  error.code = "WORLD_BOSS_SEASON_BOSS_ORPHANS";
  error.orphanCount = orphanCount;
  error.orphanSample = orphanSample;
  return error;
}

async function findOrphans(knex) {
  return knex(`${TABLE} as roster`)
    .leftJoin(`${REFERENCED_TABLE} as boss`, `roster.${COLUMN}`, "boss.id")
    .whereNull("boss.id")
    .orderBy("roster.id", "asc")
    .limit(ORPHAN_SAMPLE_LIMIT)
    .select(
      "roster.id as seasonBossId",
      `roster.${COLUMN} as worldBossId`,
      knex.raw("COUNT(*) OVER() as orphanCount")
    );
}

exports.up = async function (knex) {
  const orphans = await findOrphans(knex);
  if (orphans.length) {
    const orphanCount = Number(orphans[0].orphanCount);
    const orphanSample = orphans.map(({ seasonBossId, worldBossId }) => ({
      seasonBossId,
      worldBossId,
    }));
    throw orphanError(orphanCount, orphanSample);
  }

  await knex.schema.alterTable(TABLE, table => {
    table.index([COLUMN], INDEX);
  });
  await knex.schema.alterTable(TABLE, table => {
    table
      .foreign(COLUMN, FOREIGN_KEY)
      .references(REFERENCED_COLUMN)
      .inTable(REFERENCED_TABLE)
      .onDelete("RESTRICT");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable(TABLE, table => {
    table.dropForeign([COLUMN], FOREIGN_KEY);
    table.dropIndex([COLUMN], INDEX);
  });
};

exports.config = { transaction: false };
