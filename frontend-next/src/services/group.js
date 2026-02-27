import api from "./api";

export const fetchGroupSpeakRank = (groupId) =>
  api.get(`/api/Group/${groupId}/Speak/Rank`).then(r => r.data);
export const fetchGroupConfig = (groupId) =>
  api.get(`/api/Group/${groupId}/Config`).then(r => r.data);
export const fetchGroupConfigData = () =>
  api.get("/api/GroupConfig").then(r => r.data);
export const switchGroupConfig = (groupId, name, status) =>
  api.put(`/api/Group/${groupId}/Name/${name}/${status}`).then(r => r.data);
export const setDiscordWebhook = (groupId, webhook) =>
  api.post(`/api/Group/${groupId}/Discord/Webhook`, { webhook }).then(r => r.data);
export const removeDiscordWebhook = (groupId) =>
  api.delete(`/api/Group/${groupId}/Discord/Webhook`).then(r => r.data);
export const testDiscordWebhook = (webhook) =>
  api.post("/api/Discord/Webhook", { webhook }).then(r => r.data);
export const setWelcomeMessage = (groupId, message) =>
  api.post(`/api/Group/${groupId}/WelcomeMessage`, { message }).then(r => r.data);
export const fetchGroupSummarys = () =>
  api.get("/api/Guild/Summarys").then(r => r.data);
export const getGroupInfo = (groupId) =>
  api.get(`/api/Guild/${groupId}/Summary`).then(r => r.data);
export const setSender = (groupId, sender) =>
  api.put(`/api/Group/${groupId}/Sender`, { sender }).then(r => r.data);
export const getSignList = (groupId, month) =>
  api.get(`/api/Guild/${groupId}/Battle/Sign/List/Month/${month}`).then(r => r.data);
export const getBattleConfig = (groupId) =>
  api.get(`/api/Guild/${groupId}/Battle/Config`).then(r => r.data);
export const updateBattleConfig = (groupId, data) =>
  api.put(`/api/Guild/${groupId}/Battle/Config`, data).then(r => r.data);
