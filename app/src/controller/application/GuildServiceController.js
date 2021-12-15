// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const GuildServiceModel = require("../../model/application/GuildService");
const GuildModel = require("../../model/application/Guild");
const minimist = require("minimist");
const i18n = require("../../util/i18n");

exports.router = [text("/guildservice", guildService), text(/^\/addservice/, addService)];

/**
 *
 * @param {Context} context
 */
async function guildService(context) {
  const { groupId } = context.event.source;
  const guildService = await GuildServiceModel.findByGroupId(groupId);

  context.replyText(JSON.stringify(guildService));
}

/**
 * 為特定群組建立服務權限
 * @param {Context} context
 */
async function addService(context) {
  // 僅限於管理員
  if (context.state.isAdmin === false && context.event.source.type === "user") {
    return;
  }

  const { text } = context.event.message;
  const { groupId, _ } = minimist(text.split(" "));
  const serviceName = _[1];

  if (!serviceName) {
    context.replyText(i18n.__("message.service.add_usage"));
    return;
  }

  if (!groupId) {
    context.replyText(i18n.__("message.service.add_usage"));
    return;
  }

  const guildServices = await GuildServiceModel.findByGroupId(groupId);
  if (guildServices.includes(serviceName)) {
    context.replyText(i18n.__("message.service.already_exists", { serviceName, groupId }));
    return;
  }

  const guild = await GuildModel.findByGroupId(groupId);

  await GuildServiceModel.create({ guild_id: guild.ID, service: serviceName });
  context.replyText(i18n.__("message.service.add_success", { serviceName, groupId }));
}
