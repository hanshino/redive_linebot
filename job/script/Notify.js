const linebot = require("linebot");
const bot = linebot({
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});
const redis = require("../lib/redis");

exports.sendAD = async () => {
  let keys = await redis.keys("ReplyToken*");
  console.log(keys);
};