const crypto = require("crypto");
const path = require("path");
const { promisify } = require("util");
const { execFile } = require("child_process");
const knex = require("knex");

const dbConfig = require("../../knexfile");

const execFileAsync = promisify(execFile);
const TEST_DATABASE = `Princess_wbtest_runtime_utc_${process.pid}_${Date.now().toString(36)}_${crypto
  .randomBytes(4)
  .toString("hex")}`;
const DATABASE_USER = process.env.DB_USER;
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

jest.setTimeout(30000);

beforeAll(async () => {
  await admin.raw(
    `CREATE DATABASE \`${TEST_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
  );
  await admin.raw(`GRANT ALL PRIVILEGES ON \`${TEST_DATABASE}\`.* TO ??@'%'`, [DATABASE_USER]);
});

afterAll(async () => {
  let cleanupError;
  try {
    await admin.raw(`DROP DATABASE IF EXISTS \`${TEST_DATABASE}\``);
  } catch (error) {
    cleanupError = error;
  }
  try {
    await admin.destroy();
  } catch (error) {
    cleanupError ||= error;
  }
  if (cleanupError) {
    throw cleanupError;
  }
});

test("runtime database uses Taipei session time and preserves exact JavaScript instants", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(__dirname, "runtimeMysqlUtcProbe.js")],
    {
      cwd: path.resolve(__dirname, "../.."),
      env: {
        ...process.env,
        QUERY_LOG: "0",
        RUNTIME_UTC_TEST_DATABASE: TEST_DATABASE,
        TZ: "Asia/Taipei",
      },
    }
  );
  const result = JSON.parse(stdout);

  expect(result.sessionTimezone).toBe("+08:00");
  expect(result.insertedAt).toBe("2026-07-19T12:34:56.789Z");
  expect(result.insertedAtText).toBe("2026-07-19 20:34:56.789");
  expect(new Date(result.createdAt).getTime()).toBeGreaterThanOrEqual(
    new Date(result.beforeSession).getTime()
  );
  expect(new Date(result.createdAt).getTime()).toBeLessThanOrEqual(
    new Date(result.afterSession).getTime()
  );
});
