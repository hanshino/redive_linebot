import api from "./api";

export const getNotifyData = () =>
  api.get("/api/Bot/Notify/Data").then(r => r.data);
export const setStatus = (key, status) =>
  api.put(`/api/Bot/Notify/${key}/${status}`).then(r => r.data);
export const notifyTest = () =>
  api.post("/api/Bot/Notify/Test").then(r => r.data);
export const revokeNotify = () =>
  api.delete("/api/Bot/Notify/Binding").then(r => r.data);
