const Axios = require("axios");
const axios = Axios.default;
var cheerio = require("cheerio");
const { CustomLogger } = require("../lib/Logger");
const mysql = require("../lib/mysql");
const princessHost = "http://www.princessconnect.so-net.tw";

module.exports = {
  main: async function () {
    let url = await getAllUrls(); //取最新消息網址
    let dbUrls = await getUrlsFromDB();

    for (i = 0; i < url.length; i++) {
      let u = url[i];
      let contain = await getPrincessContain(u);
      await delay();

      if (dbUrls.includes(u)) {
        CustomLogger.info(`>>${contain.title}<< 已存在於資料庫，跳過此筆`);
        continue; // 重複略過
      } else {
        CustomLogger.info(`>>${contain.title}<< 新增一筆`);
      }

      await insertBulletin(contain);
    }
  },
};

/**
 * 取目前公告所有url
 * @returns {Promise<Array<String>>}
 */
function getAllUrls() {
  return getBody(`${princessHost}/news`)
    .then(res => res.data)
    .then(body => {
      let urls = [];
      const $ = cheerio.load(body);

      $('.news_con a[href^="/news"]').each(function () {
        urls.push(princessHost + $(this).attr("href"));
      });

      return urls;
    });
}

/**
 * 抓資料庫title比對重複資料
 */
async function getUrlsFromDB() {
  4915;
  let query = await mysql.select("url").from("BulletIn");
  result = query.map(data => data.url);
  return result;
}

/**
 * 取公主連結公告內容
 * @param {String} url
 */
function getPrincessContain(url) {
  return getBody(url)
    .then(res => res.data)
    .then(body => {
      var contain = {};
      const $ = cheerio.load(body);

      contain.url = url;
      contain.sort = $("article h2 span").text().trim();
      contain.date = $(".news_con h2").text().trim().replace(contain.sort, "");
      contain.title = $("article h3").text().trim();
      contain.p = $("article section").text().trim();

      return contain;
    });
}

/**
 * 取得網址原始碼，統一加入header 避免被ban
 * @param {String} url
 * @param {Promise}
 */
function getBody(url) {
  return axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36",
    },
  });
}

/**
 * 將資料新增至資料庫
 * @param {Object} contain
 * @param {String} contain.title
 * @param {String} contain.sort
 * @param {String} contain.p
 */
function insertBulletin(contain) {
  return mysql.insert(contain).into("BulletIn");
}

/**
 * 避免被ban 加入delay機制
 */
function delay() {
  let delayMS = 1000 + Math.round((Math.random() * 100000) % 1000);
  return new Promise(res => setTimeout(res, delayMS));
}
