const Axios = require("axios").default;

const axios = Axios.create({
  baseURL: `http://${process.env.OPENCV_HOST}:3000`,
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

/**
 * 將圖片傳至python進行分析
 * @param {String} imageBase
 */
exports.analyzeArenaBattle = imageBase => {
  return axios
    .post("/api/v1/Arena/Battle/Result", {
      image: imageBase,
      type: "base64",
    })
    .then(res => res.data)
    .catch(err => false);
};

/**
 * 將圖片傳至python抓取搜尋參數
 * @param {String} imageBase
 */
exports.getArenaSearchTeam = imageBase => {
  return axios
    .post("/api/v1/Arena/Battle/Search", {
      image: imageBase,
      type: "base64",
    })
    .then(res => res.data)
    .catch(err => {
      console.log(err);
      return false;
    });
};

/**
 * 傷害輸出圖表產生器
 * @param {Object} payload 要發送到api的資料
 * @returns {Promise<String>} 傷害輸出圖表 base64
 */
exports.generateRankImage = async payload => {
  return await axios
    .post("/api/v1/World/Boss/DamageChart", payload)
    .then(res => res.data)
    .catch(err => {
      console.log(err);
      return false;
    });
};
