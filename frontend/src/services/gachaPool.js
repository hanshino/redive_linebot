import api from "./api";

export const fetchData = () =>
  api.get("/api/Admin/GachaPool/Data").then(r => r.data);
export const updateData = (id, data) =>
  api.put("/api/Admin/GachaPool/Data", { id, ...data }).then(r => r.data);
export const insertData = (data) =>
  api.post("/api/Admin/GachaPool/Data", data).then(r => r.data);
export const deleteData = (id) =>
  api.delete(`/api/Admin/GachaPool/Data/${id}`).then(r => r.data);
