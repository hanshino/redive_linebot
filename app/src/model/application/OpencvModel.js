const Axios = require("axios").default;

const axios = Axios.create({
  baseURL: "http://172.20.10.11:3000",
  timeout: 10000,
});

/**
 * 將圖片傳至python opencv api進行分析
 * @param {String} imageBase base64圖片
 */
exports.analyzeGuildBattle = imageBase => {
  return axios
    .post("/api/v1/Guild/Battle/Info", {
      image: imageBase,
      type: "base64",
    })
    .then(res => res.data)
    .catch(err => false);
};
