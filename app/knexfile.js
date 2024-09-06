// Update with your config settings.
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: "../.env",
  });
}

module.exports = {
  client: "mysql2",
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_USER_PASSWORD,
    port: process.env.DB_PORT,
    database: "Princess",
  },
  pool: { min: 0, max: 10 },
};
