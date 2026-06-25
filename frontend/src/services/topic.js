import api from "./api";

// 文字雲（topic word-cloud）資料來源。userId 由後端從 LIFF token 取得，
// 前端不傳；days 只送 7 / 30。
export const fetchMyTopics = (days = 30, groupId = null) =>
  api
    .get("/api/topic/me", { params: { days, ...(groupId ? { groupId } : {}) } })
    .then(r => r.data);

export const fetchGroupTopics = (groupId, days = 30) =>
  api.get(`/api/topic/group/${groupId}`, { params: { days } }).then(r => r.data);
