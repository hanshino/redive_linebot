const crypto = require("crypto");
const path = require("path");
const knex = require("knex");

const dbConfig = require("../../../knexfile");
const minigameLevelSeeder = require("../../../seeds/MinigameLevelSeeder");

const PREFIX = "__wbtest_";
const ACTIVE_SLOT = 1;
const DATABASE_PREFIX = "Princess_wbtest_";
const SETUP_TIMEOUT_MS = 30000;

function slotFor() {
  return ACTIVE_SLOT;
}

function databaseLabel(label) {
  return `${label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

function createWorldBossTestDatabase(label) {
  const namePrefix = `${DATABASE_PREFIX}${databaseLabel(label)}_`;
  const databaseName = `${namePrefix}${process.pid}_${Date.now().toString(36)}_${crypto
    .randomBytes(4)
    .toString("hex")}`;
  const adminConfig = {
    ...dbConfig,
    connection: {
      ...dbConfig.connection,
      user: "root",
      password: process.env.DB_PASSWORD,
    },
  };
  delete adminConfig.connection.database;

  const admin = knex(adminConfig);
  const mysql = knex({
    ...dbConfig,
    connection: { ...dbConfig.connection, database: databaseName },
  });
  let appDestroyed = false;
  let adminDestroyed = false;

  async function destroyApp() {
    if (!appDestroyed) {
      appDestroyed = true;
      await mysql.destroy();
    }
  }

  async function destroyAdmin() {
    if (!adminDestroyed) {
      adminDestroyed = true;
      await admin.destroy();
    }
  }

  async function teardown() {
    let cleanupError;
    try {
      await destroyApp();
    } catch (error) {
      cleanupError = error;
    }
    try {
      if (!adminDestroyed) await admin.raw(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    } catch (error) {
      cleanupError ||= error;
    }
    try {
      await destroyAdmin();
    } catch (error) {
      cleanupError ||= error;
    }
    if (cleanupError) throw cleanupError;
  }

  async function setup() {
    try {
      await admin.raw(
        `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
      );
      await admin.raw(`GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO ??@'%'`, [
        process.env.DB_USER,
      ]);

      const [rows] = await mysql.raw("SELECT DATABASE() AS database_name");
      const connectedDatabase = rows[0].database_name;
      if (connectedDatabase === "Princess" || !connectedDatabase.startsWith(namePrefix)) {
        throw new Error(`Unsafe World Boss test database: ${connectedDatabase}`);
      }

      await mysql.migrate.latest({
        directory: path.resolve(__dirname, "../../../migrations"),
      });
      await minigameLevelSeeder.seed(mysql);
      return connectedDatabase;
    } catch (error) {
      try {
        await teardown();
      } catch (cleanupError) {
        error.cleanupError = cleanupError;
      }
      throw error;
    }
  }

  return { mysql, databaseName, namePrefix, setup, teardown };
}

function whereLiteralPrefix(query, column, prefix) {
  return query.whereRaw("LEFT(??, ?) = ?", [column, prefix.length, prefix]);
}

async function cleanupByPrefix(mysql, prefix = PREFIX) {
  const seasons = await whereLiteralPrefix(mysql("world_boss_season"), "name", prefix).select("id");
  const ids = seasons.map(row => row.id);

  if (ids.length) {
    await mysql("world_boss_season_reward").whereIn("season_id", ids).del();
    await mysql("world_boss_contribution").whereIn("season_id", ids).del();
    await mysql("world_boss_round").whereIn("season_id", ids).del();
    await mysql("world_boss_season").whereIn("id", ids).del();
  }

  await whereLiteralPrefix(mysql("world_boss"), "name", prefix).del();
}

module.exports = {
  PREFIX,
  ACTIVE_SLOT,
  DATABASE_PREFIX,
  SETUP_TIMEOUT_MS,
  slotFor,
  createWorldBossTestDatabase,
  cleanupByPrefix,
};
