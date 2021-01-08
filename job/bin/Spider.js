const Axios = require("axios");
const { contains } = require("cheerio");
const axios = Axios.default
var cheerio = require('cheerio');
const mysql = require("../lib/mysql");

module.exports = {

    //抓取當前頁面最新消息網址
    get_url: function (body) {
        let i = 0;
        let result = [];
        const $ = cheerio.load(body);
        //console.log($('.news_con a[href^="/news"]').attr("href"));
        $('.news_con a[href^="/news"]')
            .each(function () {
                result[i] = 'http://www.princessconnect.so-net.tw' + $(this).attr("href");
                i++;
            });
        return result;
    },

    get_contain: async function (url, cmp_title) {
        return axios.get(url)
            .then((res) => res.data)
            .then(body => {
                var contain = {};
                let result = false;
                const $ = cheerio.load(body);

                contain.url = url;
                contain.sort = $('article h2 span').text().trim();
                contain.date = $('.news_con h2').text().trim().replace(contain.sort, "");
                contain.title = $('article h3').text().trim();
                contain.p = $('article section').text().trim();
                //INSERT INTO `Bulletin`(`sort`, `date`, `title`, `p`, `id`) VALUES ([value-1],[value-2],[value-3],[value-4],[value-5])
                result = cmp_title.includes(contain.title);
                console.log(result);

                if (result) {
                    console.log("重複");
                    return Promise.reject();
                }
                else {
                    console.log("無重複");
                    return contain;
                }
            })
            .then(function (contain) {
                let query = mysql.insert(contain).into("Bulletin");
                console.log(query.toSQL().toNative());
                return query;
            })
            .then(console.log)
            .catch(console.log)
    },

    //抓資料庫title比對重複資料
    database_title: async function () {
        let query = await mysql.select("title").from("Bulletin");
        result = query.map(function (data) {
            return data.title;
        })
        return result;
    },

    all_url: function () {
        return axios.get("http://www.princessconnect.so-net.tw/news")
            .then((res) => res.data)
            .then(body => {
                //console.log(body);
                let url = this.get_url(body);
                //console.log(url);
                return url;
            });
    },


    main: async function () {
        let url = await this.all_url();  //取最新消息網址
        //console.log(url);
        let cmp_title = await this.database_title();
        //console.log(Array.isArray(cmp_title));

        for (i = 0; i < url.length; i++) {
            //console.log(url[i]);
            await this.get_contain(url[i], cmp_title);
        }
    }
}
