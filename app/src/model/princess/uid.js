const mysql = require("../../util/mysql");
const redis = require("../../util/redis");
const fetch = require("node-fetch");
const axios = require("axios").default;
const nicknameAPI = "https://www.pay.so-net.tw/exchange/checkUser";
const profileAPI = `${process.env.IAN_API_URL}/pcredive/profile`;

exports.table = "PrincessUID";

/**
 * 綁定遊戲ID
 * @param {Object} option
 * @param {String} option.userId Line ID
 * @param {String} option.uid 遊戲 ID
 * @param {String} option.background 小卡背景
 * @param {Number} option.server 遊戲伺服器
 */
exports.binding = option => {
  let { userId, uid, server, background } = option;

  background = background || "https://pcredivewiki.tw/static/images/unit_big/unit_big_105861.jpg";

  return mysql.transaction(trx => {
    let queryUid = trx.select("*").from(this.table).where({ userId });
    let insertUid = trx.insert({ userId, uid, server, background }).into(this.table);
    let updateUid = trx(this.table).update({ uid, server, background }).where({ userId });

    queryUid
      .then(res => (res.length > 0 ? updateUid : insertUid))
      .then(result => (result ? trx.commit() : trx.rollback()));
  });
};

/**
 * 取得綁定資料
 * @param {String} userId
 * @return {Promise<{uid: String, server: Number}|undefined>}
 */
exports.getBindingData = userId => {
  return mysql
    .select(["uid", "server", "background"])
    .from(this.table)
    .where({ userId })
    .then(res => res[0]);
};

/**
 * @typedef {Object} bindData
 * @property {String} uid
 * @property {Number} server
 * @property {String} nickname
 * 取得綁定資料（包含遊戲暱稱）
 * @param {String} userId
 * @return {Promise<bindData>} return false on non-binding
 */
exports.getData = async userId => {
  const uidData = await this.getBindingData(userId);
  if (!uidData) return {};

  return {
    ...uidData,
    nickname: await getPrincessNickName(uidData.uid, uidData.server),
  };
};

/**
 * 清除綁定資料
 * @param {String} userId
 */
exports.cleanBinding = async userId => {
  return mysql.from(this.table).where({ userId }).delete();
};

async function getPrincessNickName(uid, server) {
  let memoryKey = `Nickname_${uid}_${server}`;
  let nickname = await redis.get(memoryKey);
  if (nickname !== null) return nickname;

  const url = new URL(nicknameAPI);
  url.search = new URLSearchParams({
    userId: uid,
    serverChannelId: server,
    gameCode: "SON009",
  }).toString();
  let response = await fetch(url, {
    method: "get",
    headers: {
      "Content-Type": "application/json",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.97 Safari/537.36",
    },
  });

  let result = await response.json();

  if (!response.ok) return false;
  if (result.status !== "ok") return false;

  nickname = result.userName;
  redis.set(memoryKey, nickname, 60 * 60);

  return nickname;
}

exports.getIanProfileData = async userId => {
  const uidData = await this.getBindingData(userId);
  if (!uidData) return {};

  const { uid, server } = uidData;

  if (server > 2) {
    let result = await getPrincessNickName(uid, server).catch(err => console.error(err));
    return {
      user_info: { user_name: result },
      ...uidData,
    };
  }

  let result = await axios.get(profileAPI, {
    headers: {
      "x-token": process.env.IAN_PROFILE_TOKEN,
    },
    params: {
      uid,
      server,
      cache: true,
    },
  });

  return {
    ...result.data,
    ...uidData,
  };
};
