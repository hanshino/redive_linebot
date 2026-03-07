const mysql = require("../src/util/mysql");
const redis = require("../src/util/redis");
const { CustomLogger } = require("../src/util/Logger");
const { default: axios } = require("axios");

module.exports = main;

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    await consume();
  } catch (err) {
    console.error(err);
  }
  running = false;
}

async function consume() {
  let count = 0;
  let markIds = [];

  while (true) {
    let memberData = await redis.rPop("CleanUpMembers");
    if (memberData === null) break;
    count++;

    memberData = JSON.parse(memberData);

    let profile = await getGroupMemberProfile(memberData.groupId, memberData.userId);

    if (!profile) {
      CustomLogger.info(memberData.id, "準備標記刪除");
      markIds.push(memberData.id);
    }

    if (count > 1000) break;

    await delay(Math.random() * 1);
  }

  CustomLogger.info(`關閉 ${markIds.length} 個 群組會員資料`);

  if (markIds.length > 0) {
    await mysql("GuildMembers").update({ status: 0, LeftDTM: new Date() }).whereIn("ID", markIds);
  }
}

async function getGroupMemberProfile(groupId, userId) {
  try {
    const res = await axios.get(
      `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`,
      { headers: { Authorization: `Bearer ${process.env.LINE_ACCESS_TOKEN}` } }
    );
    return res.data;
  } catch {
    return null;
  }
}

function delay(seconds) {
  return new Promise(res => setTimeout(res, seconds * 1000));
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
