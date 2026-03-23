import api from "../services/api";

export const getCurrentRace = () => api.get("/api/race/current").then(r => r.data);

export const placeBet = (raceId, runnerId, amount) =>
  api.post("/api/race/bet", { raceId, runnerId, amount }).then(r => r.data);

export const getMyBets = () => api.get("/api/race/current/my-bets").then(r => r.data);

export const getRecentFinished = () => api.get("/api/race/recent-finished").then(r => r.data);

export const getRaceById = raceId => api.get(`/api/race/${raceId}`).then(r => r.data);
