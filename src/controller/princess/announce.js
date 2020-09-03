const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { showAnnounce } = require("../../templates/princess/announce");

exports.showAnnounce = context => {
  fetch("http://www.princessconnect.so-net.tw/news?page=1")
    .then(res => res.text())
    .then(body => {
      var $ = cheerio.load(body);

      var dts = $("article dt");
      var dds = $("article dd");
      var eventCount = dts.length;
      var events = [];

      for (let i = 0; i < eventCount; i++) {
        let title = dts.eq(i).text().trim();
        let content = dds.eq(i).text().trim();
        let href = dds.eq(i).find("a").attr("href");

        events.push({
          title,
          content,
          href: `http://www.princessconnect.so-net.tw${href}`,
        });
      }

      showAnnounce(context, events);
    });
};
