import api from "./api";

export const fetchOrders = (sourceId) =>
  api.get(`/api/Source/${sourceId}/Customer/Orders`).then(r => r.data);
export const updateOrder = (sourceId, orderData) =>
  api.put(`/api/Source/${sourceId}/Customer/Orders`, orderData).then(r => r.data);
export const insertOrder = (sourceId, orderData) =>
  api.post(`/api/Source/${sourceId}/Customer/Orders`, orderData).then(r => r.data);
export const setOrderStatus = (sourceId, orderKey, status) =>
  api.put(`/api/Source/${sourceId}/Customer/Orders/${orderKey}/${status}`).then(r => r.data);
