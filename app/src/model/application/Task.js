const path = require("path");
const knex = require("knex")({
  client: "sqlite3",
  connection: {
    filename: path.resolve(process.cwd(), "./assets/task.db"),
  },
  useNullAsDefault: true,
});

exports.connection = knex;

exports.init = async () => {
  const exists = await knex.schema.hasTable("tasks");
  console.log("exists", exists);
  if (exists) {
    return;
  }

  await knex.schema.createTable("tasks", table => {
    table.increments("id").primary();
    table.string("name");
    table.string("description").comment("任務描述");
    table.timestamp("last_run_at").comment("上次執行時間");
  });
};

exports.write = async (attributes, last_run_at) => {
  const { name, description } = attributes;
  const exists = await knex("tasks").where({ name }).first();
  if (exists) {
    await knex("tasks").where({ name }).update({ last_run_at });
  } else {
    await knex("tasks").insert({ name, description, last_run_at });
  }
};
