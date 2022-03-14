// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const minimist = require("minimist");
const { get, trim } = require("lodash");
const redis = require("../../util/redis");
const i18n = require("../../util/i18n");
const config = require("config");
const expire = 7 * 24 * 60 * 60; // 7天到期

exports.adminRouter = [text(/^[!]alias/, alias)];

/**
 * 新增別名
 * @param {Context} context
 */
async function alias(context) {
  const message = context.event.message.text;
  const args = minimist(message.split(" "));
  const restStr = message.replace(get(args, "_.0"), "").trim();

  if (get(args, "_").length === 1) {
    await context.replyText(i18n.__("message.alias.add_usage"));
    return;
  }

  const [newAlias, command] = trim(restStr, '"').split("=");

  await setAlias(newAlias, command);

  return context.replyText(`${newAlias} 已經設定成 ${command}`);
}

async function setAlias(newAlias, command) {
  const redisKey = `${config.get("redis.prefix.alias")}:${newAlias}`;
  const redisValue = command;
  await redis.set(redisKey, redisValue, expire);
}
