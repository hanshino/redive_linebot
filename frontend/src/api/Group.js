import axios from "axios";

export default {
  fetchGroupSpeakRank(groupId) {
    return axios.get(`/api/Group/${groupId}/Speak/Rank`).then(res => res.data);
  },

  fetchGroupConfig(groupId) {
    return axios.get(`/api/Group/${groupId}/Config`);
  },

  /**
   * 取得群組設定 文案
   */
  fetchGroupConfigData() {
    return axios.get("/api/GroupConfig");
  },

  /**
   * 群組設定功能開關
   * @param {String} groupId
   * @param {String} name
   * @param {Number} status 1 : on, 0 : off
   */
  switchGroupConfig(groupId, name, status) {
    return axios.put(`/api/Group/${groupId}/Name/${name}/${status}`);
  },

  setDiscordWebhook(groupId, webhook) {
    return axios.post(`/api/Group/${groupId}/Discord/Webhook`, { webhook });
  },

  removeDiscordWebhook(groupId) {
    return axios.delete(`/api/Group/${groupId}/Discord/Webhook`);
  },

  testDiscordWebhook(webhook) {
    return axios.post(`/api/Discord/Webhook`, { webhook });
  },

  setWelcomeMessage(groupId, message) {
    return axios.post(`/api/Group/${groupId}/WelcomeMessage`, { message });
  },

  fetchGroupSummarys() {
    return axios.get(`/api/Guild/Summarys`).then(res => res.data);
  },

  getGroupInfo(groupId) {
    return axios
      .get(`/api/Guild/${groupId}/Summary`)
      .then(res => res.data)
      .catch(() => ({}));
  },

  /**
   * 設定群組發送人
   * @param {String} groupId
   * @param {Object} sender
   * @param {Object} sender.name
   * @param {Object} sender.iconUrl
   */
  setSender(groupId, sender) {
    return axios.put(`/api/Group/${groupId}/Sender`, sender).then(res => res.data);
  },

  getSignList(groupId, month) {
    return axios.get(`/api/Guild/${groupId}/Battle/Sign/List/Month/${month}`).then(res => res.data);
  },
};
