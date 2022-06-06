exports.isLineUserId = userId => /^U[a-f0-9]{32}$/.test(userId);
exports.isLineGroupId = groupId => /^C[a-f0-9]{32}$/.test(groupId);
exports.isLineRoomId = roomId => /^R[a-f0-9]{32}$/.test(roomId);
exports.isImageUrl = url => /^https?:\/\/.+\.(jpg|jpeg|png|gif)$/.test(url);
exports.hasSpace = str => /\s/.test(str);
