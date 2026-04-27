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

  // 每次事件都重新取（兩端皆走 Redis 快取，寫入時即時 invalidate），
  // 避免 Bottender session state 把舊的 guildConfig 持久化導致 LIFF 設定不生效。
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
