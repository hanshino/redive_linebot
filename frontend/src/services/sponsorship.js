import api from "./api";

const BASE = "/api/owner/sponsorships";

export const fetchPlayers = q =>
  api.get(`${BASE}/players`, { params: { q } }).then(r => r.data.items || []);
export const fetchPlayerSummary = id => api.get(`${BASE}/players/${id}/summary`).then(r => r.data);
export const fetchCards = () => api.get(`${BASE}/cards`).then(r => r.data.items || []);
export const fetchSponsorships = params => api.get(BASE, { params }).then(r => r.data);
export const fetchSponsorship = id => api.get(`${BASE}/${id}`).then(r => r.data);
// requestId 必須與 body.requestId 一致；同一次操作重試沿用同一個 requestId。
export const createSponsorship = (payload, requestId) =>
  api
    .post(BASE, { ...payload, requestId }, { headers: { "Idempotency-Key": requestId } })
    .then(r => r.data);
export const bindSponsorship = (id, userId) =>
  api.post(`${BASE}/${id}/bind`, { userId }).then(r => r.data);
