import api from "./api";

export const fetchItems = () =>
  api.get("/api/GodStoneShop").then((r) => r.data);

export const createItem = (data) =>
  api.post("/api/Admin/GodStoneShop/item", data).then((r) => r.data);

export const updateItem = (id, data) =>
  api.put(`/api/Admin/GodStoneShop/item/${id}`, data).then((r) => r.data);

export const deleteItem = (id) =>
  api.delete(`/api/Admin/GodStoneShop/item/${id}`).then((r) => r.data);

export const fetchGachaPoolData = () =>
  api.get("/api/Admin/GachaPool/Data").then((r) => r.data);

export const fetchCharacterImages = () =>
  api.get("/api/Princess/Character/Images").then((r) => r.data);
