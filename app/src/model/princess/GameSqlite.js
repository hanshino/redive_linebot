const path = require("path");
const knex = require("knex")({
  client: "better-sqlite3",
  connection: {
    filename: path.resolve(process.cwd(), "./assets/redive_tw.db"),
  },
  useNullAsDefault: true,
});

module.exports = knex;
