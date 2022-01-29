const path = require("path");
const knex = require("knex")({
  client: "sqlite3",
  connection: {
    filename: path.resolve(process.cwd(), "./assets/redive_tw.db"),
  },
  useNullAsDefault: true,
});

/**
 * @returns { import("knex").Knex }
 */
module.exports = knex;
