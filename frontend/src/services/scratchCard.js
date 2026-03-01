import api from "./api";

export const fetchCards = () =>
  api.get("/api/scratch-cards").then((r) => r.data);

export const generateCards = (data) =>
  api.post("/api/scratch-cards/generate", data).then((r) => r.data);
