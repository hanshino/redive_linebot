exports.isLineUserId = userId => /^U[a-f0-9]{32}$/.test(userId);
exports.isLineGroupId = groupId => /^C[a-f0-9]{32}$/.test(groupId);
exports.isLineRoomId = roomId => /^R[a-f0-9]{32}$/.test(roomId);
exports.isImageUrl = url => /^https?:\/\/.+\.(jpg|jpeg|png|gif)$/.test(url);
exports.hasSpace = str => /\s/.test(str);
/**
 * 開頭一定是指令，用於移除開頭的指令字串，字串格式必須要以空格間隔
 * @param {String} text
 */
exports.removeOrder = text => {
  const order = text.split(/\s/g)[0];
  return text.replace(order, "").trim();
};
