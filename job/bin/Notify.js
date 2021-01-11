const { default: axios } = require("axios");
axios.defaults.headers.common = { Authorization: `Bearer ${process.env.LINE_ACCESS_TOKEN}` };
axios.defaults.baseURL = "https://api.line.me/v2";
const message = { type: "text", text: "test" };
const { CustomLogger } = require("../lib/Logger");
const redis = require("../lib/redis");
const NotifyListModel = require("../model/NotifyListModel");
const notify = require("../lib/notify");

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
  let [list, subTypes] = await Promise.all([
    NotifyListModel.getList(),
    NotifyListModel.getSubTypes(),
  ]);

  let SubscribeType = await NotifyListModel.getSubTypes();
  let PrincessNewsTokenList = list
    .filter(data => {
      let { subType } = data;
      let subSwitch = transSubData(SubscribeType, subType);
      let princessSwitch = subSwitch.find(subData => subData.key === "PrincessNews");
      return princessSwitch.status === 1;
    })
    .map(data => data.token);

  await procPrincessNews(PrincessNewsTokenList);
};

exports.run = async () => {
  while (true) {
    let data = await NotifyListModel.consumeNotifyList();
    if (data === null) break;
    await notify.push(data);
  }
};

function delay(second) {
  return new Promise(res => {
    setTimeout(() => {
      res();
    }, second * 1000);
  });
}

/**
 * 處理新消息發送
 * @param {Array} tokenList
 */
async function procPrincessNews(tokenList) {
  let [newsData] = await NotifyListModel.getLatestNews();
  if (!newsData) return;

  await Promise.all(
    tokenList.map(token => {
      return Promise.all([
        NotifyListModel.insertNotifyList({ token, message: newsData.title, type: 1 }),
        NotifyListModel.insertNotifyList({
          token,
          message: `詳細資訊請參考:${newsData.url}`,
          type: 1,
        }),
      ]);
    })
  );
}

/**
 * 訂閱類型轉譯成資料
 * @param {Array} SubscribeType
 * @param {Number} intSubType
 * @returns {Promise<Array<key: String, title: String, description: String, status: Number>>}
 */
function transSubData(SubscribeType, intSubType) {
  const SubSwitch = getSubSwitch(SubscribeType);
  let switchAry = SubSwitch.join("") + intSubType.toString(2);
  switchAry = switchAry.substr(SubSwitch.length * -1).split("");
  return SubscribeType.map((data, index) => ({ ...data, status: parseInt(switchAry[index]) }));
}

function getSubSwitch(SubscribeType) {
  return Array.from({ length: SubscribeType.length }).map(() => "0");
}
