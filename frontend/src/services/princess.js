import api from "./api";

export const getCharacterImages = () =>
  api.get("/api/Princess/Character/Images").then(r => r.data);
