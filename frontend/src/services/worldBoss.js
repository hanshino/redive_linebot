import api from "./api";

export const getSnapshot = () => api.get("/api/game/world-boss/snapshot").then(r => r.data);
export const getMe = () => api.get("/api/game/world-boss/me").then(r => r.data);
export const postAttack = (attackType = "normal") =>
  api.post("/api/game/world-boss/attack", { attackType }).then(r => r.data);
export const postBlock = () => api.post("/api/game/world-boss/block", {}).then(r => r.data);
export const postRevive = () => api.post("/api/game/world-boss/revive", {}).then(r => r.data);
export const postShield = () => api.post("/api/game/world-boss/shield", {}).then(r => r.data);
export const postRole = (role, reselect = false) =>
  api.post("/api/game/world-boss/role", { role, reselect }).then(r => r.data);
export const postEnhance = equipmentId =>
  api.post("/api/game/world-boss/enhance", { equipment_id: equipmentId }).then(r => r.data);
export const getReport = () => api.get("/api/game/world-boss/report").then(r => r.data);
