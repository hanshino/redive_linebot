import axios from "axios";

export default {
  fetchDatas() {
    return axios.get("/api/Admin/GlobalOrders/Data").then(res => res.data);
  },

  insertData(objData) {
    return axios.post("/api/Admin/GlobalOrders/Data", objData).then(res => res.data);
  },

  updateData(objData) {
    return axios.put("/api/Admin/GlobalOrders/Data", objData).then(res => res.data);
  },

  deleteData(orderKey) {
    return axios.delete(`/api/Admin/GlobalOrders/Data/${orderKey}`).then(res => res.data);
  },
};
