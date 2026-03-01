import api from "./api";

export const fetchGroupSpeakRank = (groupId) =>
  api.get(`/api/groups/${groupId}/speak-rank`).then(r => r.data);
export const fetchGroupConfig = (groupId) =>
  api.get(`/api/groups/${groupId}/config`).then(r => r.data);
export const fetchGroupConfigData = () =>
  api.get("/api/group-config").then(r => r.data);
export const switchGroupConfig = (groupId, name, status) =>
  api.put(`/api/groups/${groupId}/features/${name}/${status}`).then(r => r.data);
export const setDiscordWebhook = (groupId, webhook) =>
  api.post(`/api/groups/${groupId}/discord-webhook`, { webhook }).then(r => r.data);
export const removeDiscordWebhook = (groupId) =>
  api.delete(`/api/groups/${groupId}/discord-webhook`).then(r => r.data);
export const testDiscordWebhook = (webhook) =>
  api.post("/api/discord/webhook-test", { webhook }).then(r => r.data);
export const setWelcomeMessage = (groupId, message) =>
  api.post(`/api/groups/${groupId}/welcome-message`, { message }).then(r => r.data);
export const fetchGroupSummarys = () =>
  api.get("/api/guilds").then(r => r.data);
export const getGroupInfo = (groupId) =>
  api.get(`/api/guilds/${groupId}`).then(r => r.data);
export const setSender = (groupId, sender) =>
  api.put(`/api/groups/${groupId}/sender`, { sender }).then(r => r.data);
export const getSignList = (groupId, month) =>
  api.get(`/api/guilds/${groupId}/battle-signs/months/${month}`).then(r => r.data);
export const getBattleConfig = (groupId) =>
  api.get(`/api/guilds/${groupId}/battle-config`).then(r => r.data);
export const updateBattleConfig = (groupId, data) =>
  api.put(`/api/guilds/${groupId}/battle-config`, data).then(r => r.data);
