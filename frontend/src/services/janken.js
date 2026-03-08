import api from "./api";

export const getRankings = () => api.get("/api/janken/rankings").then(r => r.data);
export const getRecentMatches = () => api.get("/api/janken/recent-matches").then(r => r.data);
