const redis = require("redis");
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD,
});

redisClient.connect();

redisClient.on("error", console.error);
redisClient.on("connect", () => console.log("Redis connected"));

module.exports = redisClient;
