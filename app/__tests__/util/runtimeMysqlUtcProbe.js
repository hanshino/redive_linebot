const database = require("../../src/util/mysql");

async function run() {
  const testDatabase = process.env.RUNTIME_UTC_TEST_DATABASE;
  if (!testDatabase) {
    throw new Error("RUNTIME_UTC_TEST_DATABASE is required");
  }
  if (process.env.TZ !== "Asia/Taipei") {
    throw new Error("runtime UTC probe requires TZ=Asia/Taipei");
  }

  const runtimeDatabase = database.createDatabase(testDatabase);
  try {
    await runtimeDatabase.schema.createTable("runtime_utc_probe", table => {
      table.increments("id").primary();
      table.dateTime("inserted_at", { precision: 3 }).notNullable();
      table
        .dateTime("created_at", { precision: 3 })
        .notNullable()
        .defaultTo(runtimeDatabase.raw("CURRENT_TIMESTAMP(3)"));
    });

    const [timezoneRows] = await runtimeDatabase.raw("SELECT @@session.time_zone AS session_tz");
    const instant = new Date("2026-07-19T12:34:56.789Z");
    const [beforeRows] = await runtimeDatabase.raw("SELECT CURRENT_TIMESTAMP(3) AS session_now");
    const [id] = await runtimeDatabase("runtime_utc_probe").insert({ inserted_at: instant });
    const row = await runtimeDatabase("runtime_utc_probe").where({ id }).first();
    const [insertedAtTextRows] = await runtimeDatabase.raw(
      "SELECT DATE_FORMAT(inserted_at, '%Y-%m-%d %H:%i:%s.%f') AS inserted_at_text FROM runtime_utc_probe WHERE id = ?",
      [id]
    );
    const [afterRows] = await runtimeDatabase.raw("SELECT CURRENT_TIMESTAMP(3) AS session_now");

    process.stdout.write(
      JSON.stringify({
        sessionTimezone: timezoneRows[0].session_tz,
        insertedAt: row.inserted_at.toISOString(),
        insertedAtText: insertedAtTextRows[0].inserted_at_text.slice(0, 23),
        createdAt: row.created_at.toISOString(),
        beforeSession: beforeRows[0].session_now.toISOString(),
        afterSession: afterRows[0].session_now.toISOString(),
      })
    );
  } finally {
    await runtimeDatabase.destroy();
    await database.destroy();
  }
}

run().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
