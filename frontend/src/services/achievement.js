import api from "./api";

export const getUserAchievements = userId =>
  api.get(`/api/achievements/user/${userId}`).then(res => res.data);

export const getAchievementStats = () => api.get("/api/achievements/stats").then(res => res.data);
