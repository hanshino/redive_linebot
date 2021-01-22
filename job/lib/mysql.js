const knex = require("knex")({
  client: "mysql2",
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_USER_PASSWORD,
    database: "Princess",
  },
});

module.exports = knex;
