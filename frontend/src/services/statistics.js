import api from "./api";

export const getLineBotData = () => api.get("/api/statistics").then(r => r.data);
