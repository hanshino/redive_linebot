const TABLE = "world_boss_round";
const REFERENCED_TABLE = "world_boss";
const COLUMN = "world_boss_id";
const REFERENCED_COLUMN = "id";
const INDEX = "idx_wbr_world_boss";
const FOREIGN_KEY = "fk_wbr_world_boss";
const ORPHAN_SAMPLE_LIMIT = 10;
const EXPECTED_COLUMN_TYPE = "bigint unsigned";

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

async function tableMetadata(knex, tableName) {
  return knex("information_schema.TABLES")
    .where({ TABLE_SCHEMA: knex.raw("DATABASE()"), TABLE_NAME: tableName })
    .first("ENGINE");
}

async function columnMetadata(knex, tableName, columnName) {
  return knex("information_schema.COLUMNS")
    .where({
      TABLE_SCHEMA: knex.raw("DATABASE()"),
      TABLE_NAME: tableName,
      COLUMN_NAME: columnName,
    })
    .first("COLUMN_TYPE");
}

async function indexMetadata(knex) {
  return knex("information_schema.STATISTICS")
    .where({ TABLE_SCHEMA: knex.raw("DATABASE()"), TABLE_NAME: TABLE, INDEX_NAME: INDEX })
    .orderBy("SEQ_IN_INDEX")
    .select("NON_UNIQUE", "SEQ_IN_INDEX", "COLUMN_NAME", "SUB_PART", "INDEX_TYPE");
}

async function foreignKeyMetadata(knex) {
  const rows = await knex("information_schema.KEY_COLUMN_USAGE as usage")
    .join("information_schema.REFERENTIAL_CONSTRAINTS as relation", function () {
      this.on("relation.CONSTRAINT_SCHEMA", "=", "usage.CONSTRAINT_SCHEMA")
        .andOn("relation.TABLE_NAME", "=", "usage.TABLE_NAME")
        .andOn("relation.CONSTRAINT_NAME", "=", "usage.CONSTRAINT_NAME");
    })
    .where({
      "usage.CONSTRAINT_SCHEMA": knex.raw("DATABASE()"),
      "usage.CONSTRAINT_NAME": FOREIGN_KEY,
    })
    .select(
      "usage.TABLE_NAME",
      "usage.COLUMN_NAME",
      "usage.REFERENCED_TABLE_NAME",
      "usage.REFERENCED_COLUMN_NAME",
      "relation.DELETE_RULE",
      "relation.UPDATE_RULE"
    );
  return rows;
}

function assertExactIndex(rows) {
  if (!rows.length) return false;
  const exact =
    rows.length === 1 &&
    Number(rows[0].NON_UNIQUE) === 1 &&
    Number(rows[0].SEQ_IN_INDEX) === 1 &&
    rows[0].COLUMN_NAME === COLUMN &&
    rows[0].SUB_PART === null &&
    rows[0].INDEX_TYPE === "BTREE";
  if (!exact) throw new Error(`WORLD_BOSS_ROUND_INDEX_DRIFT:${INDEX}`);
  return true;
}

function assertExactForeignKey(rows) {
  if (!rows.length) return false;
  const exact =
    rows.length === 1 &&
    rows[0].TABLE_NAME === TABLE &&
    rows[0].COLUMN_NAME === COLUMN &&
    rows[0].REFERENCED_TABLE_NAME === REFERENCED_TABLE &&
    rows[0].REFERENCED_COLUMN_NAME === REFERENCED_COLUMN &&
    rows[0].DELETE_RULE === "RESTRICT" &&
    rows[0].UPDATE_RULE === "NO ACTION";
  if (!exact) throw new Error(`WORLD_BOSS_ROUND_FOREIGN_KEY_DRIFT:${FOREIGN_KEY}`);
  return true;
}

async function preflight(knex) {
  const [table, referencedTable, column, referencedColumn, indexRows, foreignKeyRows] =
    await Promise.all([
      tableMetadata(knex, TABLE),
      tableMetadata(knex, REFERENCED_TABLE),
      columnMetadata(knex, TABLE, COLUMN),
      columnMetadata(knex, REFERENCED_TABLE, REFERENCED_COLUMN),
      indexMetadata(knex),
      foreignKeyMetadata(knex),
    ]);
  if (!table || !referencedTable) {
    throw new Error(
      `WORLD_BOSS_ROUND_FOREIGN_KEY_TABLE_MISSING:${!table ? TABLE : REFERENCED_TABLE}`
    );
  }
  if (table.ENGINE !== "InnoDB" || referencedTable.ENGINE !== "InnoDB") {
    throw new Error(
      `WORLD_BOSS_ROUND_FOREIGN_KEY_ENGINE_MISMATCH:${TABLE}=${table.ENGINE};${REFERENCED_TABLE}=${referencedTable.ENGINE}`
    );
  }
  if (
    !column ||
    !referencedColumn ||
    column.COLUMN_TYPE !== EXPECTED_COLUMN_TYPE ||
    referencedColumn.COLUMN_TYPE !== EXPECTED_COLUMN_TYPE
  ) {
    throw new Error(
      `WORLD_BOSS_ROUND_FOREIGN_KEY_TYPE_MISMATCH:${COLUMN}=${
        column ? column.COLUMN_TYPE : "missing"
      };${REFERENCED_COLUMN}=${referencedColumn ? referencedColumn.COLUMN_TYPE : "missing"}`
    );
  }
  return {
    hasIndex: assertExactIndex(indexRows),
    hasForeignKey: assertExactForeignKey(foreignKeyRows),
  };
}

async function findOrphans(knex) {
  return knex(`${TABLE} as round`)
    .leftJoin(`${REFERENCED_TABLE} as boss`, `round.${COLUMN}`, "boss.id")
    .whereNull("boss.id")
    .orderBy("round.id", "asc")
    .limit(ORPHAN_SAMPLE_LIMIT)
    .select(
      "round.id as roundId",
      `round.${COLUMN} as worldBossId`,
      knex.raw("COUNT(*) OVER() as orphanCount")
    );
}

exports.up = async function (knex) {
  const { hasIndex, hasForeignKey } = await preflight(knex);
  if (hasForeignKey) return;

  const orphans = await findOrphans(knex);
  if (orphans.length) {
    const orphanCount = Number(orphans[0].orphanCount);
    const orphanSample = orphans.map(({ roundId, worldBossId }) => ({ roundId, worldBossId }));
    throw orphanError(orphanCount, orphanSample);
  }

  if (!hasIndex) {
    await knex.schema.alterTable(TABLE, table => {
      table.index([COLUMN], INDEX);
    });
  }
  await knex.schema.alterTable(TABLE, table => {
    table
      .foreign(COLUMN, FOREIGN_KEY)
      .references(REFERENCED_COLUMN)
      .inTable(REFERENCED_TABLE)
      .onDelete("RESTRICT");
  });
};

exports.down = async function (knex) {
  const { hasIndex, hasForeignKey } = await preflight(knex);
  if (hasForeignKey) {
    await knex.schema.alterTable(TABLE, table => {
      table.dropForeign([COLUMN], FOREIGN_KEY);
    });
  }
  if (hasIndex) {
    await knex.schema.alterTable(TABLE, table => {
      table.dropIndex([COLUMN], INDEX);
    });
  }
};

exports.config = { transaction: false };
