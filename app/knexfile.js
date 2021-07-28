// Update with your config settings.

module.exports = {
  development: {
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_USER_PASSWORD,
      port: process.env.DB_PORT,
      database: "Princess",
    },
  },

  staging: {
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_USER_PASSWORD,
      port: process.env.DB_PORT,
      database: "Princess",
    },
    pool: { min: 0, max: 10 },
  },

  production: {
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_USER_PASSWORD,
      port: process.env.DB_PORT,
      database: "Princess",
    },
    pool: { min: 0, max: 10 },
  },
};
