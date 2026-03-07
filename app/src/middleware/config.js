const GuildConfigModel = require("../model/application/GuildConfig");
const AdminModel = require("../model/application/Admin");

/**
 * 將群組設定檔寫入Session
 * @param {Context} context
 * @param {Object} props
 */
module.exports = async (context, props) => {
  if (context.platform !== "line") return props.next;

  const { type } = context.event.source;

  if (type === "user" && context.state.isAdmin === undefined) {
    const { userId } = context.event.source;
    context.setState({
      isAdmin: await AdminModel.isAdmin(userId),
    });
  }

  if (type !== "group") return props.next;
  // 如果已經設定過就不再設定
  let isSet = context.state.sender && context.state.guildConfig;
  if (isSet) return props.next;

  const { groupId } = context.event.source;

  const [sender, guildConfig] = await Promise.all([
    GuildConfigModel.getSender(groupId),
    GuildConfigModel.fetchConfig(groupId),
  ]);

  context.setState({
    sender,
    guildConfig,
  });

  return props.next;
};
