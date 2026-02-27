import api from "./api";

export const getLineBotData = () => api.get("/api/Pudding/Statistics").then(r => r.data);
export const getEuropeRankData = () => api.get("/api/Gacha/Rank/0").then(r => r.data);
export const getAfricaRankData = () => api.get("/api/Gacha/Rank/1").then(r => r.data);
export const getUserData = () => api.get("/api/My/Statistics").then(r => r.data);
