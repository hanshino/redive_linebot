const knex = require("knex")({
  client: "mysql2",
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_USER_PASSWORD,
    port: process.env.DB_PORT,
    database: "Princess",
  },
  pool: { min: 0, max: 10 },
});

module.exports = knex;
