// 此文件用於數據蒐集
const LineModel = require("../model/platform/line");
const { router, line, route } = require("bottender/router");
const { io } = require("../util/connection");
const MessageIO = io.of("/Admin/Messages");

module.exports = async (context, props) => {
  // 暫時只對LINE進行數據處理
  if (context.platform !== "line") return props.next;

  eventFire(context);

  return router([
    line.message(context => Handle(context, props, HandleMessage)),
    line.follow(context => Handle(context, props, HandleFollow)),
    line.unfollow(context => Handle(context, props, HandleUnfollow)),
    line.join(context => Handle(context, props, HandleJoin)),
    line.leave(context => Handle(context, props, HandleLeave)),
    line.memberJoined(context => Handle(context, props, HandleMemberJoined)),
    line.memberLeft(context => Handle(context, props, HandleMemberLeft)),
    route("*", props.next),
  ]);
};

/**
 * 統一收集要進行的動作，並且回傳next讓程式繼續
 * @param {Context} context
 * @param {Object} props
 * @param {Function} fn
 */
function Handle(context, props, fn) {
  fn(context);
  return props.next;
}

async function HandleMessage(context) {
  if (context.event.isText === false) return;
  if (context.event.source.userId === undefined) return;
  UserRecord(context);
  if (context.event.source.type !== "group") return;
  await Promise.all([GroupRecord(context), GroupMembersRecord(context)]);
  LineModel.increaseSpeakTimes(context.event.source.userId, context.event.source.groupId);
}

function HandleFollow(context) {
  UserRecord(context);
}

function HandleUnfollow(context) {
  LineModel.closeUser(context.event.source.userId);
}

function HandleJoin(context) {
  GroupRecord(context);
}

function HandleLeave(context) {
  LineModel.closeGroup(context.event.source.groupId);
}

function HandleMemberJoined(context) {
  LineModel.memberJoined(
    context.event._rawEvent.joined.members[0].userId,
    context.event.source.groupId
  );
}

function HandleMemberLeft(context) {
  LineModel.memberLeft(
    context.event._rawEvent.left.members[0].userId,
    context.event.source.groupId
  );
}

/**
 * 針對群組做紀錄，紀錄活躍中的群組
 * @param {Context} context
 */
async function GroupRecord(context) {
  const { groupId } = context.event.source;
  var groupData = await LineModel.getGroup(groupId);

  groupData = groupData.length === 0 ? false : groupData[0];

  if (groupData === false) {
    await LineModel.insertGroup(groupId);
  } else if (groupData.Status === 0) {
    await LineModel.openGroup(groupId);
  }
}

/**
 * 記錄此用戶
 * @param {Context} context
 */
async function UserRecord(context) {
  const { userId } = context.event.source;
  const { platform } = context;

  var userData = await LineModel.getUser(userId);

  userData = userData.length === 0 ? false : userData[0];

  if (userData === false) {
    await LineModel.insertUser(userId, platform);
  } else if (userData.status === 0) {
    await LineModel.openUser(userId);
  }
}

/**
 * 紀錄用戶所在群組分布
 * @param {Context} context
 */
async function GroupMembersRecord(context) {
  const { userId, groupId } = context.event.source;

  var memberData = await LineModel.getGuildMember(userId, groupId);

  memberData = memberData.length === 0 ? false : memberData[0];

  if (memberData === false) {
    await LineModel.memberJoined(userId, groupId);
  } else if (memberData.status === 0) {
    await LineModel.setMemberStatus(userId, groupId, 1);
  }
}

function eventFire(context) {
  const event = context.event._rawEvent;

  if (event.source.type === "group") {
    event.source = {
      ...event.source,
      ...context.state.groupDatas,
    };

    event.source.groupUrl = context.state.groupDatas.pictureUrl;
  }

  event.source = {
    ...event.source,
    ...context.state.userDatas[event.source.userId],
  };

  MessageIO.emit("newEvent", event);
}
