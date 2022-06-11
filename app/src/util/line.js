const { default: axios } = require("axios");
const token = process.env.LINE_ACCESS_TOKEN;
const apiURL = "https://api.line.me/v2";
const { getClient } = require("bottender");
const LineClient = getClient("line");
const redis = require("./redis");

exports.getGroupSummary = groupId => {
  let key = `${groupId}_summary`;
  return redis.get(key).then(cache => {
    if (cache !== null) return JSON.parse(cache);
    return doGet(`/bot/group/${groupId}/summary`).then(res => {
      redis.set(key, JSON.stringify(res), {
        EX: 60,
      });
      return res;
    });
  });
};

exports.getGroupCount = groupId => {
  let key = `${groupId}_count`;
  return redis.get(key).then(cache => {
    if (cache !== null) return JSON.parse(cache);
    return doGet(`/bot/group/${groupId}/members/count`).then(res => {
      redis.set(key, JSON.stringify(res), {
        EX: 60,
      });
      return res;
    });
  });
};

exports.getUsersProfile = async userDatas => {
  return await Promise.all(
    userDatas.map(async data => {
      if (data.groupId !== undefined) {
        return LineClient.getGroupMemberProfile(data.groupId, data.userId);
      } else if (data.roomId !== undefined) {
        return LineClient.getRoomMemberProfile(data.roomId, data.userId);
      } else {
        return LineClient.getUserProfile(data.userId);
      }
    })
  )
    .then(userProfiles => {
      let hashProfile = {};
      userProfiles.forEach(profile => (hashProfile[profile.userId] = profile));
      return hashProfile;
    })
    .catch(console.error);
};

exports.getGroupMemberProfile = async (groupId, userId) => {
  let key = `GroupMemberProfile_${groupId}_${userId}`;
  let profile = await redis.get(key);

  if (profile !== null) return JSON.parse(profile);
  profile = await LineClient.getGroupMemberProfile(groupId, userId);
  redis.set(key, JSON.stringify(profile), {
    EX: 60 * 60,
  });

  return profile;
};

/**
 * 去除訊息內 tag 別人的姓名
 * @param {String} text
 * @param {Array<{index: Number, length: Number, userId: String}>} mentionees
 */
exports.trimMentionees = (text, mentionees) => {
  let result = text;
  mentionees.forEach(mention => {
    let remove = result.substring(mention.index, mention.index + mention.length);
    result = result.replace(remove, "");
  });
  return result.trim();
};

/**
 * 取出訊息內的標記對象姓名
 * @param {String} text
 * @param {Object} mention
 * @param {Number} mention.index
 * @param {Number} mention.length
 * @param {String} mention.userId
 */
exports.getMentionName = (text, mention) => {
  return text.substring(mention.index, mention.index + mention.length).replace("@", "");
};

function doGet(path) {
  return axios
    .get(`${apiURL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    .then(res => res.data);
}
