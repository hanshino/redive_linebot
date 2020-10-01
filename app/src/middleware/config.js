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

  const { groupId } = context.event.source;

  context.setState({
    sender: await GuildConfigModel.getSender(groupId),
  });

  context.setState({
    guildConfig: await GuildConfigModel.fetchConfig(groupId),
  });

  return props.next;
};
