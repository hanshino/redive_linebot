import axios from "axios";

export default {
  /**
   * 取得歐洲排行資料
   */
  getEruopeRankData() {
    return axios
      .get("/api/Gacha/Rank/0")
      .then(res => res.data)
      .catch(() => []);
  },

  /**
   * 取得非洲排行資料
   */
  getAfricaRankData() {
    return axios
      .get("/api/Gacha/Rank/1")
      .then(res => res.data)
      .catch(() => []);
  },

  /**
   * 取得Line機器人數據
   */
  getLineBotData() {
    return axios
      .get("/api/Pudding/Statistics")
      .then(res => res.data)
      .catch(() => {});
  },

  /**
   * 取得用戶數據
   */
  getUserData() {
    return axios
      .get("/api/My/Statistics")
      .then(res => res.data)
      .catch(() => {});
  },
};
