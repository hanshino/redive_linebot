import axios from "axios";

export default {
  getNotifyData() {
    return axios.get("/api/Bot/Notify/Data").then(res => res.data);
  },

  setStatus(key, status) {
    return axios.put(`/api/Bot/Notify/${key}/${status}`).then(res => res.data);
  },

  notifyTest() {
    return axios.post(`/api/Bot/Notify/Test`);
  },

  revokeNotify() {
    return axios.delete("/api/Bot/Notify/Binding");
  },
};
