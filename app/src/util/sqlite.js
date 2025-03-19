const knex = require("knex");

/**
 * @returns { import("knex").Knex }
 */
module.exports = file => {
  console.log("file", file);
  return knex({
    client: "better-sqlite3",
    connection: {
      filename: file,
    },
    useNullAsDefault: true,
  });
};
