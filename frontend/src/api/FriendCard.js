import axios from "axios";

export default {
  /**
   * 綁定
   * @param {Object} option
   * @param {String} option.uid
   * @param {Number} option.server
   * @param {String} option.background
   */
  binding(option) {
    return axios.post("/api/Princess/Friend/Card", option);
  },

  getBindData() {
    return axios
      .get("/api/Princess/Friend/Card")
      .then(res => res.data)
      .catch(() => ({}));
  },

  resetData() {
    return axios.delete("/api/Princess/Friend/Card");
  },
};
