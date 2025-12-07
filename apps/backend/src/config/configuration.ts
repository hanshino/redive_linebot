export default () => ({
  port: parseInt(process.env.BACKEND_PORT ?? "3000", 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  },
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  },
});
