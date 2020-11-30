const { default: axios } = require("axios");
axios.defaults.headers.common = { Authorization: `Bearer ${process.env.LINE_ACCESS_TOKEN}` };
axios.defaults.baseURL = "https://api.line.me/v2";
const message = {
  type: "carousel",
  contents: [
    {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "🍮布丁系統全面升級",
                size: "lg",
                weight: "bold",
              },
              {
                type: "text",
                text: "更快的處理速度\n更方便的管理介面",
                wrap: true,
                style: "italic",
              },
              {
                type: "image",
                url:
                  "https://github.com/hanshino/redive_linebot/raw/master/readmepic/GachaPool.png",
                size: "full",
                aspectMode: "fit",
                aspectRatio: "20:9",
              },
              {
                type: "text",
                text:
                  "積極尋找合作夥伴，想經營機器人卻不善寫程式??\n歡迎洽談合作，提供方便的後台進行指令管理、各遊戲模擬抽獎",
                wrap: true,
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "button",
                    action: {
                      type: "uri",
                      label: "全新首頁",
                      uri: "https://liff.line.me/1654464491-YNenGe96",
                    },
                  },
                  {
                    type: "button",
                    action: {
                      type: "uri",
                      label: "開源計畫",
                      uri: "https://github.com/hanshino/redive_linebot",
                    },
                  },
                ],
              },
              {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "button",
                    action: {
                      type: "uri",
                      label: "Discord頻道",
                      uri: "https://discord.gg/Fy82rTb",
                    },
                  },
                ],
              },
            ],
            paddingAll: "lg",
          },
        ],
      },
    },
    {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "群組數據改版",
                weight: "bold",
                size: "lg",
              },
              {
                type: "image",
                url:
                  "https://cdn.discordapp.com/attachments/682123271529037824/782990218814423090/unknown.png",
                size: "full",
                aspectRatio: "20:10",
                aspectMode: "cover",
              },
              {
                type: "text",
                text: "全面分析群組的訊息類型，快來探討誰才是群組的各領域王者吧！",
                wrap: true,
              },
            ],
            paddingAll: "lg",
            spacing: "sm",
          },
          {
            type: "button",
            action: {
              type: "uri",
              label: "群組數據",
              uri: "https://liff.line.me/1654464491-YNenGe96",
            },
            style: "primary",
          },
        ],
      },
    },
    {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "公主連結玩家",
                size: "lg",
                weight: "bold",
              },
              {
                type: "image",
                url:
                  "https://cdn.discordapp.com/attachments/682123271529037824/782992862694080573/unknown.png",
                size: "full",
                aspectRatio: "20:9",
              },
              {
                type: "text",
                text:
                  "針對公連玩家的改版！\n不想使用麻煩的戰隊系統嗎??\n本系統只要兩個指令！\n#三刀出完、#出完沒",
                wrap: true,
              },
              {
                type: "text",
                text:
                  "\n❌不需要嚴格控管傷害輸出的你們\n❌不需要嚴格控管出刀順序的你們\n⭕只追求早點出完早點睡覺的你們\n⭕只追求每日不管手動歐透的你們\n⭕只追求每日真的只要三刀的你們",
                wrap: true,
                size: "sm",
              },
            ],
            paddingAll: "lg",
          },
        ],
      },
    },
  ],
};
const { CustomLogger } = require("../lib/Logger");
const redis = require("../lib/redis");
var count = 0;

exports.sendAD = async () => {
  let keys = await redis.keys("ReplyToken*");
  console.log(keys.length, "筆要處理");
  await keys.forEach(async key => {
    try {
      let sourceId = key.replace("ReplyToken_", "");
      let sentKey = `sent_${sourceId}`;
      let token = await redis.get(key);
      let msg = JSON.parse(JSON.stringify(message));

      if (sourceId[0] !== "C") {
        console.log(sourceId, "不是群組");
        return;
      }
      if (!token) {
        console.log("沒有token");
        return;
      }
      if ((await redis.get(sentKey)) !== null) {
        console.log("已發送過", sourceId);
        return;
      }

      msg.contents[1].body.contents[1].action.uri =
        msg.contents[1].body.contents[1].action.uri + `?reactRedirectUri=/Group/${sourceId}/Record`;

      // if (sourceId !== "C00c12a1e8f2daf1dd68893fbb584848f") return;

      let result = await axios
        .post("bot/message/reply", {
          replyToken: token,
          messages: [
            { type: "text", text: "抱歉打擾了！剛有收過的朋友很抱歉！連結出了點問題再發一次！" },
            { type: "flex", altText: "布丁快訊", contents: msg, sender: { name: "布丁開發" } },
          ],
        })
        .then(req => req.status === 200)
        .catch(err => {
          console.log(err);
          return false;
        });

      if (result) {
        count++;
        console.log(`${sourceId} 發送成功`);
        await redis.set(sentKey, 1, 86400);
      }

      redis.del(key);
    } catch (e) {
      console.error(e);
    }
  });
};

exports.send = async () => {
  while (true) {
    await this.sendAD();
    console.log("休息10秒", `總共發了${count}`);
    await delay(10);
  }
};

exports.test = async () => {
  await redis.keys("sent_*").then(keys => {
    console.log(keys);
    keys.forEach(key => redis.del(key));
  });
};

function delay(second) {
  return new Promise(res => {
    setTimeout(() => {
      res();
    }, second * 1000);
  });
}
