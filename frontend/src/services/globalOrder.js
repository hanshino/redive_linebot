import api from "./api";

export const fetchDatas = () =>
  api.get("/api/admin/global-orders").then(r => r.data);
export const insertData = (objData) =>
  api.post("/api/admin/global-orders", objData).then(r => r.data);
export const updateData = (objData) =>
  api.put("/api/admin/global-orders", objData).then(r => r.data);
export const deleteData = (orderKey) =>
  api.delete(`/api/admin/global-orders/${orderKey}`).then(r => r.data);
