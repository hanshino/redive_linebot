import api from "./api";

export const getPreference = () => api.get("/api/auto-preference").then(res => res.data);

export const setPreference = payload =>
  api.put("/api/auto-preference", payload).then(res => res.data);

export const getHistory = ({ limit = 30, type = "all" } = {}) =>
  api.get("/api/auto-history", { params: { limit, type } }).then(res => res.data);
