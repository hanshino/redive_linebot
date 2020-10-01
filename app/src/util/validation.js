exports.Line = {};
exports.Line.verifyGroupId = groupId => /^C[a-f0-9]{32}$/.test(groupId);
exports.Line.verifyUserId = userId => /^U[a-f0-9]{32}$/.test(userId);
exports.Line.verifyRoomId = roomId => /^R[a-f0-9]{32}$/.test(roomId);
