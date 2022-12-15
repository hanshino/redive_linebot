const { default: axios } = require("axios");
const fs = require("fs");
const brotli = require("brotli");
const domain = process.env.PRINCESS_DB_REMOTE_HOST;
const gameDataModel = require("../src/model/princess/GameData");
const path = require("path");
const { DefaultLogger } = require("../src/util/Logger");
const Notify = require("../src/util/LineNotify");
const { get } = require("lodash");

module.exports = async () => {
  try {
    const [{ data: jpVersion }, { data: twVersion }] = await Promise.all([
      axios.get("https://redive.estertion.win/last_version_jp.json"),
      axios.get(`https://${domain}/static/version.json`),
    ]);

    const [dbJpversion, dbTwVersion] = await Promise.all([
      gameDataModel.first({ filter: { server: "jp" } }).orderBy("created_at", "desc"),
      gameDataModel.first({ filter: { server: "tw" } }).orderBy("created_at", "desc"),
    ]);

    const insertData = [];

    if (get(dbJpversion, "truth_version") !== jpVersion.TruthVersion) {
      await downloadGameData({
        uri: "https://redive.estertion.win/db/redive_jp.db.br",
        filename: "redive_jp.db",
      });
      insertData.push({
        truth_version: jpVersion.TruthVersion,
        hash: jpVersion.hash,
        server: "jp",
      });
    }

    if (get(dbTwVersion, "truth_version") !== twVersion.TruthVersion) {
      await downloadGameData({
        uri: `https://${domain}/static/redive_tw.db.br`,
        filename: "redive_tw.db",
      });
      insertData.push({
        truth_version: twVersion.TruthVersion,
        hash: twVersion.hash,
        server: "tw",
      });
    }

    if (insertData.length > 0) {
      await gameDataModel.insert(insertData);
      writeLog(`FetchGameData: ${JSON.stringify(insertData)}`);
    }
  } catch (e) {
    writeLog(`FetchGameData: ${e}`);
    return;
  }
};

async function downloadGameData({ uri, filename }) {
  const filepath = path.join(process.cwd(), "assets", filename);
  const compressedFilepath = `${filepath}.br`;
  const response = await axios.get(uri, {
    responseType: "arraybuffer",
  });

  fs.writeFileSync(compressedFilepath, response.data);
  fs.writeFileSync(filepath, brotli.decompress(fs.readFileSync(compressedFilepath)));
  fs.unlinkSync(compressedFilepath);
}

function writeLog(message) {
  Notify.pushMessage({
    message,
    token: process.env.LINE_NOTIFY_TOKEN,
  }).catch(err => DefaultLogger.error(err));

  DefaultLogger.info(message);
}
