// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const worldBossModel = require("../../model/application/WorldBoss");
const worldBossEventModel = require("../../model/application/WorldBossEvent");

exports.router = [text("/bosslist", bosslist), text("/eventlist", bosslistEvent)];

/**
 * @param {Context} context
 */
async function bosslist(context) {
  const data = await worldBossModel.all();
  context.replyText(JSON.stringify(data));
}

async function bosslistEvent(context) {
  const data = await worldBossEventModel.all({ withs: ["worldBoss"] });
  context.replyText(JSON.stringify(data));
}
