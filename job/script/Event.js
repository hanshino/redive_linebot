const MessageService = require("../lib/MessageService");
const EventModel = require("../model/event");
const logger = require("../lib/Logger").CustomLogger;

exports.eventDequeue = eventDequeue;

async function eventDequeue() {
  await MessageService.connect();
  let eventQueue = await MessageService.getQueue("ChatBotEvent", 86400000);
  let processCount = 0;

  while (processCount < 1000) {
    let data = await eventQueue.dequeue();
    if (!data) break;
    await eventHandle(JSON.parse(data));
    processCount++;
  }

  logger.info(`${processCount ? `處理了${processCount}筆事件` : "沒事件需要處理"}`);
}

/**
 * @typedef {Object} ChatbotEvent
 * @property {String} type
 * @property {String} replyToken
 * @property {Object} source
 * @property {String} source.userId
 * @property {String} source.type
 * @property {String} source.displayName
 * @property {Number} timestamp
 * @property {String} mode
 */

/**
 * 事件處理
 * @param {ChatbotEvent} event
 */
async function eventHandle(event) {
  let router = [
    { type: "follow", action: handleFollow },
    { type: "unfollow", action: handleUnfollow },
    { type: "join", action: handleJoin },
    { type: "leave", action: handleLeave },
    { type: "memberJoined", action: handleMemberJoined },
    { type: "memberLeft", action: handleMemberLeft },
    { type: "message", action: handleMessage },
    { type: "unsend", action: handleUnsend },
  ];

  let route = router.find(route => route.type === event.type);
  if (!route) return;

  try {
    await route.action(event);
  } catch (e) {
    console.error(e);
  }
}

function handleFollow(event) {
  return UserRecord(event.source.userId);
}

function handleUnfollow(event) {
  return EventModel.closeUser(event.source.userId);
}

function handleJoin(event) {
  return GroupRecord(event.source.groupId);
}

function handleLeave(event) {
  return EventModel.closeGroup(event.source.groupId);
}

async function handleMemberJoined(event) {
  let { groupId, userId } = event.source;
  userId = userId || event.joined.members[0].userId;
  let userData = await EventModel.getUserData(userId);

  let guildData = userData.groupList.find(list => list.guildId === groupId);

  if (!guildData) {
    await EventModel.insertMember(userId, groupId);
  } else if (guildData.status === 0) {
    await EventModel.setMemberStatus(userId, groupId, 1);
  }
}

async function handleMemberLeft(event) {
  let { groupId } = event.source;
  let { userId } = event.left.members[0];
  await EventModel.setMemberStatus(userId, groupId);
}

async function handleMessage(event) {
  if (event.source.type !== "group") return;
  let { userId, groupId } = event.source;

  UserRecord(userId);
  await Promise.all([GroupRecord(groupId), handleMemberJoined(event)]);

  let userData = await EventModel.getUserData(userId);
  let { id: memberId } = userData.groupList.find(list => list.guildId === groupId);

  if (event.message.type === "text") {
    EventModel.increaseSpeakTimes(userId, groupId);
  }

  EventModel.recordMessageTimes(event, memberId);
}

async function handleUnsend(event) {
  event.message = { type: "unsend" };
  handleMessage(event);
}

/**
 * 記錄此用戶
 */
async function UserRecord(userId) {
  const platform = "line";

  let userData = await EventModel.getUserData(userId);

  if (userData.status === -1) {
    await EventModel.insertUser(userId, platform);
  } else if (userData.status === 0) {
    await EventModel.openUser(userId);
  }
}

/**
 * 針對群組做紀錄，紀錄活躍中的群組
 * @param {String} groupId
 */
async function GroupRecord(groupId) {
  var groupData = await EventModel.getGroup(groupId);

  groupData = groupData.length === 0 ? false : groupData[0];

  if (groupData === false) {
    await EventModel.insertGroup(groupId);
  } else if (groupData.Status === 0) {
    await EventModel.openGroup(groupId);
  }
}
