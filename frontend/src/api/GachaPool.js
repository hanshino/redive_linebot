import axios from "axios";

export default {
  fetchData() {
    return axios.get(`/api/Admin/GachaPool/Data`).then(res => res.data);
  },

  updateData(id, data) {
    return axios
      .put(`/api/Admin/GachaPool/Data`, {
        id: id,
        data: data,
      })
      .then(res => res.data)
      .catch(console.error);
  },

  insertData(data) {
    return axios.post(`/api/Admin/GachaPool/Data`, { ...data }).then(res => res.data);
  },

  deleteData(id) {
    return axios
      .delete(`/api/Admin/GachaPool/Data/${id}`)
      .then(res => res.data)
      .catch(console.error);
  },
};
