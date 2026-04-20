import api from "./api";

export const fetchBanners = () => api.get("/api/admin/gacha-banners").then(r => r.data);

export const fetchBanner = id => api.get(`/api/admin/gacha-banners/${id}`).then(r => r.data);

export const createBanner = data => api.post("/api/admin/gacha-banners", data).then(r => r.data);

export const updateBanner = (id, data) =>
  api.put(`/api/admin/gacha-banners/${id}`, data).then(r => r.data);

export const deleteBanner = id => api.delete(`/api/admin/gacha-banners/${id}`).then(r => r.data);
