import api from "./api";

export const getPreference = () => api.get("/api/auto-preference").then(res => res.data);

export const setPreference = payload =>
  api.put("/api/auto-preference", payload).then(res => res.data);

export const getHistory = ({ limit = 30, type = "all" } = {}) =>
  api.get("/api/auto-history", { params: { limit, type } }).then(res => res.data);

// 每日自動配對的兩個偏好各自獨立，不共用上面的 aggregate API：
// 開啟一定要帶 acknowledged: true（後端會擋），關閉只要 enabled: false。
export const getMatchPreference = () => api.get("/api/auto-preference/match").then(res => res.data);

export const setMatchPreference = payload =>
  api.put("/api/auto-preference/match", payload).then(res => res.data);

export const getMatchBetPreference = () =>
  api.get("/api/auto-preference/match-bet").then(res => res.data);

export const setMatchBetPreference = payload =>
  api.put("/api/auto-preference/match-bet", payload).then(res => res.data);
