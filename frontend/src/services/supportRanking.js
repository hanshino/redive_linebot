import api from "./api";

const BASE = "/api/support-rankings";

export const fetchSupportRankings = () => api.get(BASE).then(r => r.data);

export const fetchMySupport = () => api.get(`${BASE}/me`).then(r => r.data);

// 403 no_support 是業務錯誤，不能被全域攔截器導回首頁。
export const setSupportHidden = hidden =>
  api.put(`${BASE}/me`, { hidden }, { skipForbiddenRedirect: true }).then(r => r.data);
