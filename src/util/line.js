const fetch = require("node-fetch");
const token = process.env.LINE_ACCESS_TOKEN;
const apiURL = "https://api.line.me/v2";
const { getClient } = require("bottender");
const LineClient = getClient("line");
const redis = require("./redis");

exports.getGroupSummary = groupId => {
  let key = `${groupId}_summary`;
  return redis.get(key).then(cache => {
    if (cache !== null) return cache;
    return doGet(`/bot/group/${groupId}/summary`).then(res => {
      redis.set(key, res, 60);
      return res;
    });
  });
};

exports.getGroupCount = groupId => {
  let key = `${groupId}_count`;
  return redis.get(key).then(cache => {
    if (cache !== null) return cache;
    return doGet(`/bot/group/${groupId}/members/count`).then(res => {
      redis.set(key, res, 60);
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

function doGet(path) {
  return fetch(`${apiURL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).then(res => res.json());
}
