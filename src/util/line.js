const fetch = require("node-fetch");
const token = process.env.LINE_ACCESS_TOKEN;
const apiURL = "https://api.line.me/v2";

exports.getGroupSummary = groupId => {
  return doGet(`/bot/group/${groupId}/summary`);
};

exports.getGroupCount = groupId => {
  return doGet(`/bot/group/${groupId}/members/count`);
};

function doGet(path) {
  return fetch(`${apiURL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).then(res => res.json());
}
