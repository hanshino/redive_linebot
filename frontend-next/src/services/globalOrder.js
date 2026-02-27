import api from "./api";

export const fetchDatas = () =>
  api.get("/api/Admin/GlobalOrders/Data").then(r => r.data);
export const insertData = (objData) =>
  api.post("/api/Admin/GlobalOrders/Data", objData).then(r => r.data);
export const updateData = (objData) =>
  api.put("/api/Admin/GlobalOrders/Data", objData).then(r => r.data);
export const deleteData = (orderKey) =>
  api.delete(`/api/Admin/GlobalOrders/Data/${orderKey}`).then(r => r.data);
