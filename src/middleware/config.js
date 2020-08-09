const GuildConfigModel = require("../model/application/GuildConfig");
/**
 * 將群組設定檔寫入Session
 * @param {Context} context
 * @param {Object} props
 */
module.exports = async (context, props) => {
  if (context.platform !== "line") return props.next;
  if (context.event.source.type !== "group") return props.next;

  const guildConfig = await GuildConfigModel.fetchConfig(context.event.source.groupId);

  if (guildConfig === undefined) return props.next;

  context.setState({
    ...context.state,
    guildConfig: JSON.parse(guildConfig.Config),
  });

  return props.next;
};
