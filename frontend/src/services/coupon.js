import api from "./api";

export const fetchCoupons = () => api.get("/api/admin/coupons").then(r => r.data);
export const fetchCoupon = id => api.get(`/api/admin/coupons/${id}`).then(r => r.data);
export const createCoupon = payload => api.post("/api/admin/coupons", payload).then(r => r.data);
export const updateCoupon = (id, payload) =>
  api.put(`/api/admin/coupons/${id}`, payload).then(r => r.data);
export const deleteCoupon = id => api.delete(`/api/admin/coupons/${id}`).then(r => r.data);
