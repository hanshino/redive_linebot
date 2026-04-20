const mysql = require("../src/util/mysql");
const redis = require("../src/util/redis");
const { DefaultLogger, CustomLogger } = require("../src/util/Logger");

module.exports = main;

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    await eventDequeue();
  } catch (err) {
    console.error(err);
  }
  running = false;
}

async function eventDequeue() {
  let processCount = 0;

  while (processCount < 1000) {
    let data = await redis.rPop("ChatBotEvent");
    if (!data) break;
    let botEvent = JSON.parse(data);
    await Promise.all([eventHandle(botEvent), handleChatExp(botEvent)]);
    processCount++;
  }
}

// --- Event handling (user/group/member tracking) ---

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

  let route = router.find(r => r.type === event.type);
  if (!route) return;

  try {
    await route.action(event);
    await saveReplyToken(event);
  } catch (e) {
    console.error(e);
  }
}

function handleFollow(event) {
  return userRecord(event.source.userId);
}

function handleUnfollow(event) {
  return closeUser(event.source.userId);
}

function handleJoin(event) {
  return groupRecord(event.source.groupId);
}

function handleLeave(event) {
  return mysql
    .update({ status: 0, closeDTM: new Date() })
    .from("Guild")
    .where({ status: 1, GuildId: event.source.groupId });
}

async function handleMemberJoined(event) {
  let { groupId, userId } = event.source;
  userId = userId || event.joined.members[0].userId;
  if (!userId || !groupId) return;

  let userData = await getUserData(userId);
  let guildData = userData.groupList.find(list => list.guildId === groupId);

  if (!guildData) {
    await mysql.insert({ guildId: groupId, userId, JoinedDTM: new Date() }).into("GuildMembers");
    clearUserCache(userId);
  } else if (guildData.status === 0) {
    await setMemberStatus(userId, groupId, 1);
  }
}

async function handleMemberLeft(event) {
  let { groupId } = event.source;
  let { userId } = event.left.members[0];
  if (!userId || !groupId) return;
  await setMemberStatus(userId, groupId, 0);
}

async function handleMessage(event) {
  if (event.source.type !== "group") return;
  let { userId, groupId } = event.source;
  if (!userId || !groupId) return;

  if (event.message.type === "text") {
    DefaultLogger.info(groupId, userId, event.message.text);
  }

  userRecord(userId);
  await Promise.all([groupRecord(groupId), handleMemberJoined(event)]);

  let userData = await getUserData(userId);
  let member = userData.groupList.find(list => list.guildId === groupId);
  if (!member) return;

  if (event.message.type === "text") {
    await mysql("GuildMembers")
      .update({ LastSpeakDTM: new Date() })
      .increment("SpeakTimes", 1)
      .where({ userId, guildId: groupId });
  }

  await recordMessageTimes(event, member.id);
}

async function handleUnsend(event) {
  event.message = { type: "unsend" };
  handleMessage(event);
}

// --- Chat exp handling ---

async function handleChatExp(botEvent) {
  const config = require("config");
  if (botEvent.source.type !== "group") return;
  if (botEvent.type !== "message" || botEvent.message.type !== "text") return;

  let { userId, groupId, displayName } = botEvent.source;
  if (!userId) return;

  let { timestamp: currTS } = botEvent;
  let lastTouchTS = await redis.get(`CHAT_TOUCH_TIMESTAMP_${userId}`);
  let count = await getGroupMemberCount(groupId);

  let rate = getExpRate(currTS, lastTouchTS);
  let additionRate = count ? getGroupExpAdditionRate(count) : 1;
  let defaultRate = config.get("chat_level.exp.rate.default");
  let globalRate = (await redis.get("CHAT_GLOBAL_RATE")) || defaultRate;
  let expUnit = Math.round((additionRate * rate * globalRate) / 100);

  DefaultLogger.info(
    "個人頻率倍率",
    rate,
    "群組倍率加成",
    additionRate,
    "經驗單位",
    expUnit,
    "伺服器倍率",
    globalRate,
    "群組人數",
    count,
    "Line名稱",
    displayName,
    "userId",
    userId
  );

  if (rate !== 0) {
    await redis.set(`CHAT_TOUCH_TIMESTAMP_${userId}`, currTS, { EX: 5 });
  }

  await redis.lPush("CHAT_EXP_RECORD", JSON.stringify({ userId, expUnit }));
}

function getExpRate(now, last) {
  let defaultRate = 100;
  let configs = [
    { diff: 1000, rate: 0 },
    { diff: 2000, rate: 10 },
    { diff: 4000, rate: 50 },
    { diff: 6000, rate: 80 },
  ];
  if (!last) return defaultRate;
  let diff = now - last;
  let target = configs.find(c => diff < c.diff);
  return target ? target.rate : defaultRate;
}

function getGroupExpAdditionRate(memberCount = 0) {
  if (memberCount < 5) return 1;
  return 1 + (memberCount - 5) * 0.02;
}

// --- Data helpers ---

async function getUserData(userId) {
  let redisKey = `JOB_USERDATA_${userId}`;
  let cached = await redis.get(redisKey);
  if (cached !== null) return JSON.parse(cached);

  let result = { userId, status: -1, groupList: [] };
  let userData = await mysql
    .select([{ userId: "platform_id" }, "status"])
    .from("user")
    .where({ platform_id: userId });

  if (userData.length !== 0) {
    result = { ...result, ...userData[0] };
    let groupData = await mysql.select("*").from("GuildMembers").where({ userId });
    result.groupList = groupData.map(data => ({
      id: data.ID,
      guildId: data.GuildId,
      status: data.Status,
    }));
  }

  await redis.set(redisKey, JSON.stringify(result), { EX: 600 });
  return result;
}

function clearUserCache(userId) {
  return redis.del(`JOB_USERDATA_${userId}`);
}

async function userRecord(userId) {
  const platform = "line";
  let userData = await getUserData(userId);

  if (userData.status === -1) {
    await mysql.insert({ platform, platform_id: userId, created_at: new Date() }).into("user");
    clearUserCache(userId);
  } else if (userData.status === 0) {
    await mysql
      .update({ status: 1, closed_at: null })
      .from("user")
      .where({ status: 0, platform_id: userId });
  }
}

async function groupRecord(groupId) {
  let groupData = await mysql.select("*").from("Guild").where({ guildId: groupId });
  let data = groupData.length === 0 ? false : groupData[0];

  if (data === false) {
    await mysql.insert({ guildId: groupId, createDTM: new Date() }).into("Guild");
  } else if (data.Status === 0) {
    await mysql
      .update({ status: 1, closeDTM: null })
      .from("Guild")
      .where({ status: 0, guildId: groupId });
  }
}

function closeUser(userId) {
  clearUserCache(userId);
  return mysql
    .update({ status: 0, closed_at: null })
    .from("user")
    .where({ status: 1, platform_id: userId });
}

async function setMemberStatus(userId, groupId, status) {
  clearUserCache(userId);
  return mysql("GuildMembers")
    .update({ status, leftDTM: status === 1 ? null : new Date() })
    .where({ guildId: groupId, userId });
}

async function recordMessageTimes(botEvent, id) {
  let increaseCol = null;
  switch (botEvent.message.type) {
    case "text":
      increaseCol = "MR_TEXT";
      break;
    case "image":
      increaseCol = "MR_IMAGE";
      break;
    case "sticker":
      increaseCol = "MR_STICKER";
      break;
    case "video":
      increaseCol = "MR_VIDEO";
      break;
    case "unsend":
      increaseCol = "MR_UNSEND";
      break;
  }
  if (!increaseCol) return;

  let affectedRow = await mysql("MessageRecord")
    .update({ MR_MODIFYDTM: new Date() })
    .increment(increaseCol)
    .where({ id });

  if (affectedRow === 0) {
    await mysql.insert({ id, MR_MODIFYDTM: new Date(), [increaseCol]: 1 }).into("MessageRecord");
  }
}

async function saveReplyToken(event) {
  let { type } = event.source;
  let sourceId = event.source[`${type}Id`];
  let token = event.replyToken;

  if (!/^[CUD][0-9a-f]{32}$/.test(sourceId)) return;
  if (!token) return;

  return redis.set(`ReplyToken_${sourceId}`, token, { EX: 20 });
}

async function getGroupMemberCount(groupId) {
  let redisKey = `LINE_GROUP_MEMBER_COUNT_${groupId}`;
  let cached = await redis.get(redisKey);
  if (cached !== null) return parseInt(cached, 10);

  try {
    let result = await mysql("GuildMembers")
      .where({ GuildId: groupId, status: 1 })
      .count({ count: "*" })
      .first();
    let count = result ? result.count : 0;
    await redis.set(redisKey, String(count), { EX: 600 });
    return count;
  } catch {
    return 0;
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
