const { default: axios } = require("axios");
const fs = require("fs");
const brotli = require("brotli");
const domain = process.env.PRINCESS_DB_REMOTE_HOST;
const gameDataModel = require("./model/princess/GameData");
const path = require("path");
const { DefaultLogger } = require("./util/Logger");
const Notify = require("./util/LineNotify");

exports.handleGameData = async () => {
  let { data } = await axios.get(`https://${domain}/redive_db/version.json`);
  let versionData = await gameDataModel.first({
    order: [
      {
        column: "created_at",
        direction: "desc",
      },
    ],
  });

  if (!versionData || versionData.truth_version !== data.TruthVersion) {
    await downloadGameData();
    await gameDataModel.create({
      truth_version: data.TruthVersion,
      hash: data.hash,
    });

    writeLog("Download game data success");

    // 解壓縮
    let result = brotli.decompress(
      fs.readFileSync(path.join(process.cwd(), "assets", "redive_tw.db.br"))
    );
    fs.writeFileSync(path.join(process.cwd(), "assets", "redive_tw.db"), result);

    writeLog("Decompress game data success");

    // 刪除壓縮檔
    fs.unlinkSync(path.join(process.cwd(), "assets", "redive_tw.db.br"));
  } else {
    DefaultLogger.info("Game data is up to date");
  }
};

async function downloadGameData() {
  const api = `https://${domain}/redive_db/redive_tw.db.br`;
  const filepath = path.join(process.cwd(), "assets", "redive_tw.db.br");
  const writer = fs.createWriteStream(filepath);

  await axios({
    url: api,
    method: "GET",
    responseType: "stream",
  }).then(response => {
    response.data.pipe(writer);
  });

  return new Promise((res, rej) => {
    writer.on("finish", () => {
      res();
    });
    writer.on("error", () => {
      rej();
    });
  });
}

function writeLog(message) {
  Notify.pushMessage({
    message,
    token: process.env.LINE_NOTIFY_TOKEN,
  });

  DefaultLogger.info(message);
}
