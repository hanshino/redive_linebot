const { getGroupSummary, getGroupCount } = require("../util/line");
const UserModel = require("../model/application/UserModel");
const redis = require("../util/redis");
const { DefaultLogger } = require("../util/Logger");
const { readProfileFromRedis, writeProfileToRedis } = require("../service/ProfileService");

// Cap LINE API stalls so total reply time stays under ~1s.
const LINE_PROFILE_TIMEOUT_MS = 200;

/**
 * 設置用戶、群組資料
 * @param {Context} context
 * @param {Object} props
 */
const middleware = async (context, props) => {
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
 * 設定Line個人資料至State。三層 cache：in-session userDatas → redis
 * `profile:{userId}` (30 分鐘) → LINE API（200ms timeout）。
 * @param {Context} context
 */
async function setLineProfile(context) {
  const { userDatas } = context.state;
  const { userId } = context.event.source;

  if (Object.prototype.hasOwnProperty.call(userDatas, userId)) return;

  let profile = await readProfileFromRedis(userId);

  if (!profile) {
    profile = await fetchLineProfileWithTimeout(context);
    if (profile) writeProfileToRedis(userId, profile);
  }

  if (!profile) return;

  context.setState({
    userDatas: { ...userDatas, [userId]: profile },
  });

  UserModel.updateProfile(userId, profile).catch(() => {});
}

async function fetchLineProfileWithTimeout(context) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`getUserProfile timeout (${LINE_PROFILE_TIMEOUT_MS}ms)`)),
      LINE_PROFILE_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([context.getUserProfile(), timeout]);
  } catch (err) {
    DefaultLogger.warn(`setLineProfile: ${err && err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
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

module.exports = middleware;
module.exports._internal = { setLineProfile };
