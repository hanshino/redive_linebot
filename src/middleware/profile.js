/**
 * 設置用戶、群組資料
 * @param {Context} context
 * @param {Object} props
 */
module.exports = async (context, props) => {
  switch (context.platform) {
    case "line":
      // 不處理無userId的用戶
      if (context.event.source.userId === undefined) return;
      await setLineProfile(context);
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
