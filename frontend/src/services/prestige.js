import api from "./api";

export const getPrestigeStatus = () => api.get("/api/prestige/status").then(res => res.data);

export const startTrial = trialId =>
  api.post("/api/prestige/trial/start", { trialId }).then(res => res.data);

export const forfeitTrial = () => api.post("/api/prestige/trial/forfeit").then(res => res.data);

export const prestige = blessingId =>
  api.post("/api/prestige/prestige", { blessingId }).then(res => res.data);
