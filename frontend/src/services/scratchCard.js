import api from "./api";

export const fetchCards = () =>
  api.get("/api/ScratchCard").then((r) => r.data);

export const generateCards = (data) =>
  api.post("/api/ScratchCard/generate", data).then((r) => r.data);
