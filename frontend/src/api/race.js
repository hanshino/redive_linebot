import axios from "axios";

const api = axios.create({ baseURL: "/api/race" });

export const getCurrentRace = () => api.get("/current").then(r => r.data);

export const placeBet = (raceId, runnerId, amount) =>
  api.post("/bet", { raceId, runnerId, amount }).then(r => r.data);

export const getMyBets = () => api.get("/current/my-bets").then(r => r.data);

export const getRaceById = raceId => api.get(`/${raceId}`).then(r => r.data);
