import api from "./api";

export const fetchItems = () =>
  api.get("/api/god-stone-shop").then((r) => r.data);

export const createItem = (data) =>
  api.post("/api/admin/god-stone-shop/items", data).then((r) => r.data);

export const updateItem = (id, data) =>
  api.put(`/api/admin/god-stone-shop/items/${id}`, data).then((r) => r.data);

export const deleteItem = (id) =>
  api.delete(`/api/admin/god-stone-shop/items/${id}`).then((r) => r.data);

export const fetchGachaPoolData = () =>
  api.get("/api/admin/gacha-pool").then((r) => r.data);

export const fetchCharacterImages = () =>
  api.get("/api/characters/images").then((r) => r.data);
