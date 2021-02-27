import axios from "axios";

export default {
  fetchOrders(sourceId) {
    return axios
      .get(`/api/Source/${sourceId}/Customer/Orders`)
      .then(res => res.data)
      .catch(() => []);
  },

  /**
   * 修改自訂指令
   * @param {String} sourceId
   * @param {Object} orderData
   */
  updateOrder(sourceId, orderData) {
    return axios({
      method: "PUT",
      data: orderData,
      url: `/api/Source/${sourceId}/Customer/Orders`,
    });
  },

  insertData(sourceId, orderData) {
    return axios.post(`/api/Source/${sourceId}/Customer/Orders`, orderData).then(res => res.data);
  },

  setOrderStatus(sourceId, orderKey, status) {
    return axios
      .put(`/api/Source/${sourceId}/Customer/Orders/${orderKey}/${status}`)
      .then(res => res.data);
  },
};
