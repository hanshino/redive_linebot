const mysql = require("../src/util/mysql");
const redis = require("../src/util/redis");
const { CustomLogger } = require("../src/util/Logger");

module.exports = main;

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    await updateRecords();
  } catch (err) {
    console.error(err);
  }
  running = false;
}

async function updateRecords() {
  let records = await getAllExpRecords();
  let hashRecord = {};

  if (records.length === 0) {
    CustomLogger.info("mergeRecord", "無紀錄需要處理");
    return;
  }

  records.forEach(record => {
    hashRecord[record.userId] = hashRecord[record.userId] || 0;
    hashRecord[record.userId] += record.expUnit;
  });

  let userIds = Object.keys(hashRecord);
  let expDatas = userIds.map(userId => ({ userId, experience: hashRecord[userId] }));

  await initialUsers(userIds);
  await writeRecords(expDatas);
}

async function getAllExpRecords() {
  let records = [];
  while (records.length <= 1000) {
    let strRecord = await redis.rPop("CHAT_EXP_RECORD");
    if (strRecord === null) break;
    records.push(JSON.parse(strRecord));
  }
  return records;
}

async function initialUsers(userIds) {
  let userDatas = await Promise.all(userIds.map(getUserByUserId));
  userDatas = userDatas.filter(data => data.userId);
  let existIds = userDatas.map(data => data.userId);
  let insertIds = userIds.filter(userId => !existIds.includes(userId));

  if (insertIds.length === 0) return;

  let queries = insertIds.map(genInsertUser);
  await mysql.transaction(async trx => {
    await Promise.all(queries.map(query => query.transacting(trx).catch(() => false)));
  });

  insertIds.forEach(userId => redis.del(`CHAT_USER_${userId}`));
}

async function getUserByUserId(userId) {
  let userKey = `CHAT_USER_${userId}`;
  let data = await redis.get(userKey);
  if (data !== null) return JSON.parse(data);

  let rows = await mysql
    .select([{ id: "cud.id", exp: "cud.experience", userId: "user.platform_id" }])
    .from("chat_user_data as cud")
    .join("user", "user.id", "cud.id")
    .where("user.platform_id", userId);

  data = rows[0] || {};
  await redis.set(userKey, JSON.stringify(data), { EX: 600 });
  return data;
}

function genInsertUser(userId) {
  return mysql.from(mysql.raw("?? (??)", ["chat_user_data", "id"])).insert(function () {
    this.from("user as u").where("u.platform_id", userId).select({ id: "id" });
  });
}

async function writeRecords(expDatas) {
  let recordDatas = await Promise.all(
    expDatas.map(data =>
      getUserByUserId(data.userId).then(userData => ({
        ...data,
        id: userData.id,
      }))
    )
  );

  let queries = recordDatas.map(data =>
    mysql
      .update({
        modify_date: new Date(),
        experience: mysql.raw("experience + ?", [data.experience]),
      })
      .from("chat_user_data")
      .where({ id: data.id })
  );

  await mysql.transaction(async trx => {
    await Promise.all(queries.map(query => query.transacting(trx).catch(console.error)));
  });
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
