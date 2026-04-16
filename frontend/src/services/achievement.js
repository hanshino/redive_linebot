import api from "./api";

export const getAllAchievements = () => api.get("/api/achievements").then(res => res.data);

export const getUserAchievements = userId =>
  api.get(`/api/achievements/user/${userId}`).then(res => res.data);

export const getAchievementStats = () => api.get("/api/achievements/stats").then(res => res.data);

export const getUserTitles = userId => api.get(`/api/titles/user/${userId}`).then(res => res.data);
