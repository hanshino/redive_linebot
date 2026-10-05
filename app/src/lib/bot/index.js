const engine = process.env.BOT_ENGINE === undefined ? "bottender" : process.env.BOT_ENGINE;

if (engine === "native") {
  module.exports = { ...require("./native"), engine };
} else if (engine === "bottender") {
  const { chain, withProps, getClient, Context, LineContext, bottender } = require("bottender");
  const { router, route, text, line } = require("bottender/router");
  module.exports = {
    chain,
    withProps,
    getClient,
    Context,
    LineContext,
    bottender,
    router,
    route,
    text,
    line,
    engine,
    clearLineSession: groupId => require("../../util/redis").del(`line:${groupId}`),
  };
} else {
  throw new Error(`Unknown BOT_ENGINE: ${engine}`);
}
