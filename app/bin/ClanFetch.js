const gamedata = require("../src/model/princess/GameSqlite");
const moment = require("moment");
const { default: axios } = require("axios");
const fetchUri = `${process.env.IAN_API_URL}/clan/fetch`;
const i18n = require("../src/util/i18n");

async function main() {
  const periodData = await gamedata("clan_battle_period")
    .select("*")
    .orderBy("clan_battle_id", "desc")
    .first();

  const { start_time, end_time } = periodData;
  const startAt = moment(start_time, "YYYY/MM/DD hh:mm:ss");
  const endAt = moment(end_time, "YYYY/MM/DD hh:mm:ss");
  const now = moment();

  if (now.isBetween(startAt, endAt) === false) {
    return;
  }

  const fetchPromise = Array.from({ length: 4 }).map((_, index) => {
    const server = index + 1;

    console.log("server", server);
    console.log(`正在獲取 ${i18n.__(`server.${server}`)} 的戰隊排名資料`);

    return axios
      .get(fetchUri, {
        params: { server },
        headers: {
          "x-token": process.env.IAN_PROFILE_TOKEN,
        },
        timeout: 60 * 1000,
      })
      .then(() => console.log(`${i18n.__(`server.${server}`)} 獲取成功`))
      .catch(error => {
        console.log(JSON.stringify(error.response.data));
        console.log(error.response.status);
        console.log(error.request);
        console.log(`${i18n.__(`server.${server}`)} 獲取失敗`);
      });
  });

  await Promise.all(fetchPromise);
}

module.exports = main;

if (require.main === module) {
  main().then(() => process.exit());
}
