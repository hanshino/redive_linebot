import api from "./api";

export const getRankings = () => api.get("/api/janken/rankings").then(r => r.data);
export const getRecentMatches = () => api.get("/api/janken/recent-matches").then(r => r.data);
// 只回本人今日的自動配對結果，對手僅有暱稱與頭像。
export const getAutoMatchToday = () => api.get("/api/janken/auto-match/today").then(r => r.data);
// 本人過往自動配對結果，依 run_date 新到舊；沒參與的日子不會出現。
export const getAutoMatchHistory = (limit = 30) =>
  api.get("/api/janken/auto-match/history", { params: { limit } }).then(r => r.data);
