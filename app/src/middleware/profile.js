const { getGroupSummary, getGroupCount } = require("../util/line");

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
      await Promise.all([setLineProfile(context), setLineGroupSummary(context)]);
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
