const { getGroupSummary, getGroupCount } = require("../util/line");
const UserModel = require("../model/application/UserModel");
const redis = require("../util/redis");

/**
 * 設置用戶、群組資料
 * @param {Context} context
 * @param {Object} props
 */
module.exports = async (context, props) => {
  switch (context.platform) {
    case "line":
      // 不處理無userId的用戶
      if (context.event.source.userId === undefined) return props.next;
      await Promise.all([
        setLineProfile(context),
        setLineGroupSummary(context),
        setUserId(context),
      ]);
      break;
    default:
      break;
  }

  return props.next;
};

/**
 * 設定Line個人資料至State
 * @param {Context} context
 */
function setLineProfile(context) {
  const { userDatas } = context.state;
  const { userId } = context.event.source;

  if (Object.prototype.hasOwnProperty.call(userDatas, userId) === true) return;

  return context.getUserProfile().then(profile => {
    let temp = { ...userDatas };
    temp[userId] = profile;
    context.setState({
      userDatas: temp,
    });

    // Best-effort update profile in DB
    UserModel.updateProfile(userId, profile).catch(() => {});
  });
}

async function setLineGroupSummary(context) {
  if (context.event.source.type !== "group") return;
  const { groupId } = context.event.source;

  if (Object.keys(context.state.groupDatas).length === 0) {
    const [summary, groupCount] = await Promise.all([
      getGroupSummary(groupId),
      getGroupCount(groupId),
    ]);
    context.setState({
      groupDatas: { ...summary, ...groupCount },
    });
  }
}

async function setUserId(context) {
  const platformId = context.event.source.userId;

  // 優先使用 redis 的 userId
  const cached = await redis.get(`user:${platformId}`);

  if (cached) {
    context.event._rawEvent.source = { ...context.event.source, id: cached };
    return;
  }

  // 查詢資料庫，不存在則自動建立
  const id = await UserModel.ensureUser(platformId);

  await redis.set(`user:${platformId}`, id);
  context.event._rawEvent.source = { ...context.event.source, id };
}
