const knex = require("knex")({
  client: "mysql2",
  connection: {
    host: "mysql",
    user: "admin",
    password: "123456",
    database: "Princess",
  },
  pool: { min: 0, max: 10 },
});

module.exports = knex;
