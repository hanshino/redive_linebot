import axios from "axios";

export default {
  getCharacterImages() {
    return axios
      .get("/api/Princess/Character/Images")
      .then(res => res.data)
      .catch(() => []);
  },
};
