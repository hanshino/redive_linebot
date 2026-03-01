import api from "./api";

export const getCharacterImages = () =>
  api.get("/api/characters/images").then(r => r.data);
