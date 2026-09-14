import api from "./api";

export const getRankings = () => api.get("/api/janken/rankings").then(r => r.data);
export const getRecentMatches = () => api.get("/api/janken/recent-matches").then(r => r.data);
export const getSeasons = () => api.get("/api/janken/seasons").then(r => r.data);
export const getSeasonTop = id => api.get(`/api/janken/seasons/${id}/top`).then(r => r.data);
export const getMyTodayReward = userId =>
  api.get(`/api/janken/me/today-reward`, { params: { userId } }).then(r => r.data);
// 只回本人今日的自動配對結果，對手僅有暱稱與頭像。
export const getAutoMatchToday = () => api.get("/api/janken/auto-match/today").then(r => r.data);
