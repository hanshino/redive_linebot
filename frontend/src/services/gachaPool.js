import api from "./api";

export const fetchData = () =>
  api.get("/api/admin/gacha-pool").then(r => r.data);
export const updateData = (id, data) =>
  api.put("/api/admin/gacha-pool", { id, ...data }).then(r => r.data);
export const insertData = (data) =>
  api.post("/api/admin/gacha-pool", data).then(r => r.data);
export const deleteData = (id) =>
  api.delete(`/api/admin/gacha-pool/${id}`).then(r => r.data);
