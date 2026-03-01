import api from "./api";

export const getLineBotData = () => api.get("/api/statistics").then(r => r.data);
export const getEuropeRankData = () => api.get("/api/gacha/rankings/0").then(r => r.data);
export const getAfricaRankData = () => api.get("/api/gacha/rankings/1").then(r => r.data);
export const getUserData = () => api.get("/api/users/me/statistics").then(r => r.data);
