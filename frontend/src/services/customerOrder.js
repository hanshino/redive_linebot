import api from "./api";

export const fetchOrders = (sourceId) =>
  api.get(`/api/sources/${sourceId}/custom-orders`).then(r => r.data);
export const updateOrder = (sourceId, orderData) =>
  api.put(`/api/sources/${sourceId}/custom-orders`, orderData).then(r => r.data);
export const insertOrder = (sourceId, orderData) =>
  api.post(`/api/sources/${sourceId}/custom-orders`, orderData).then(r => r.data);
export const setOrderStatus = (sourceId, orderKey, status) =>
  api.put(`/api/sources/${sourceId}/custom-orders/${orderKey}/status`).then(r => r.data);
