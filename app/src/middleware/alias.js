const redis = require("../util/redis");
const config = require("config");

/**
 * 將別名進行替換
 * @param {Context} context
 */
module.exports = async (context, { next }) => {
  if (!context.event.isText) return next;

  const aliasPrefix = config.get("redis.prefix.alias");
  const alias = await redis.keys(`${aliasPrefix}:*`);
  const aliasList = await Promise.all(
    alias.map(async key => ({
      alias: key.replace(`${aliasPrefix}:`, ""),
      command: await redis.get(key),
    }))
  );
  const { text } = context.event.message;

  const matchedAlias = aliasList.find(({ alias }) => text.startsWith(alias));
  if (!matchedAlias) return next;

  const { command } = matchedAlias;
  const newText = text.replace(matchedAlias.alias, command);

  context.event._rawEvent.message.text = newText;
  return next;
};
