const { default: Axios } = require("axios");
const axios = Axios.create({
  baseURL: "https://api.line.me/v2",
});
axios.defaults.headers.common = { Authorization: `Bearer ${process.env.LINE_ACCESS_TOKEN}` };
const { CustomLogger } = require("../lib/Logger");
const redis = require("../lib/redis");
const NotifyListModel = require("../model/NotifyListModel");
const notify = require("../lib/notify");
const NotifyRepo = require("../repository/NotifyRepository");

var count = 0;

exports.sendByDB = async params => {
  console.log("sendByDB", params);
  const { id } = params;
  let data = await NotifyListModel.findAdMessage(id);

  if (!data) {
    return;
  }

  let { message, sender_name: senderName, sender_iconUrl: senderIcon } = data;
  console.log(message, senderName, senderIcon);

  while (true) {
    await this.sendAD({ message: JSON.stringify(message), senderName, senderIcon });
    console.log("休息10秒", `總共發了${count}`);
    await delay(10);
  }
};

exports.sendAD = async params => {
  let keys = await redis.keys("ReplyToken*");
  let { message = "未加入訊息參數", senderName = "自動通告系統", senderIcon } = params;
  const sender = { name: senderName, iconUrl: senderIcon };
  console.log(keys.length, "筆要處理");
  return await Promise.all(
    keys.map(async key => {
      try {
        let sourceId = key.replace("ReplyToken_", "");
        let sentKey = `sent_${sourceId}`;
        let token = await redis.get(key);
        let messages = parseMessage(message);

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

        let result = await axios
          .post("bot/message/reply", {
            replyToken: token,
            messages: messages.map(message => ({ ...message, sender })),
          })
          .then(req => req.status === 200)
          .catch(err => {
            console.log(err.message);
            console.log(err.response.data);
            return false;
          });

        if (result) {
          count++;
          console.log(`${sourceId} 發送成功`);
          await redis.set(sentKey, 1, 86400);
        }

        redis.del(key);
      } catch (e) {
        console.error(e.data);
      }
    })
  );
};

exports.send = async params => {
  while (true) {
    await this.sendAD(params);
    console.log("休息10秒", `總共發了${count}`);
    await delay(10);
  }
};

/**
 * 處理需要發送的資料，送進隊列
 * - 公主連結最新消息
 * - 機器人推播訊息
 * - 等級系統訊息
 */
exports.provideNotifyList = async () => {
  let [list, SubscribeType] = await Promise.all([
    NotifyListModel.getList(),
    NotifyListModel.getSubTypes(),
  ]);

  await procPrincessNews(getPrincessTokenList(list, SubscribeType));
};

/**
 * 進行發送隊列消化，直到無東西
 */
exports.consumeNotifyList = async () => {
  while (true) {
    let data = await NotifyListModel.consumeNotifyList();
    if (data === null) break;
    data.alert = data.type === 3 ? false : true;

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

function getPrincessTokenList(list, SubscribeType) {
  return list
    .filter(data => {
      let { subType } = data;
      let subSwitch = NotifyRepo.transSubData(SubscribeType, subType);
      let princessSwitch = subSwitch.find(subData => subData.key === "PrincessNews");
      return princessSwitch.status === 1;
    })
    .map(data => data.token);
}

/**
 * 處理新消息發送
 * @param {Array} tokenList
 */
async function procPrincessNews(tokenList) {
  let newsData = await NotifyListModel.getLatestNews();
  if (newsData.length === 0) return;

  await Promise.all(
    tokenList.map(token => {
      newsData.map(data => {
        return Promise.all([
          NotifyListModel.insertNotifyList({
            token,
            message: [data.sort, data.title].join("\n"),
            type: 1,
          }),
          NotifyListModel.insertNotifyList({
            token,
            message: `\n詳細資訊請參考:${data.url}`,
            type: 1,
          }),
        ]);
      });
    })
  );

  let maxId = Math.max(...newsData.map(data => data.id));
  await NotifyListModel.recordSentId(maxId);

  CustomLogger.info("紀錄最新已發送過之公告, id = ", maxId);
}

exports.queueNotify = async params => {
  let { list: notify, message, senderName, senderIcon } = params;
  let list = notify.split(",");
  let invalid = list.find(id => !verifyNotifyList(id));
  if (invalid) {
    console.error("list has invalid id", invalid);
    return;
  }

  let objMessage = parseMessage(message);
  await Promise.all(
    list.map(sourceId =>
      NotifyListModel.setPassiveNotify(sourceId, objMessage, senderName, senderIcon)
    )
  );
};

function verifyNotifyList(id) {
  return /^[CUR][0-9a-f]{32}$/.test(id);
}

function parseMessage(message) {
  try {
    message = JSON.parse(message);
  } catch (e) {
    message = { type: "text", text: message };
  }

  return Array.isArray(message) ? message : [message];
}

exports.consumePassiveNotify = async () => {
  let keys = await redis.keys(`${NotifyListModel.PASSIVE_PREFIX}*`);

  await Promise.all(
    keys.map(async key => {
      let sourceId = key.replace(NotifyListModel.PASSIVE_PREFIX, "");
      let tokenKey = `${NotifyListModel.REPLY_TOKEN_PREFIX}${sourceId}`;
      let token = await redis.get(tokenKey);
      if (!token) return;

      let { message, senderName, senderIcon } = await redis.get(key);
      let response = Array.isArray(message) ? message : [message];
      response = fixFlexMessage(response);

      if (senderName || senderIcon) {
        response = response.map(res => ({
          ...res,
          sender: { name: senderName, iconUrl: senderIcon },
        }));
      }

      let result = await axios
        .post("bot/message/reply", {
          replyToken: token,
          messages: response,
        })
        .then(req => req.status === 200)
        .catch(err => {
          redis.del(tokenKey);
          return false;
        });

      if (result) {
        redis.del(key);
        redis.del(tokenKey);
        CustomLogger.info(`${sourceId} 發送完畢，清除資料`);
      } else {
        CustomLogger.info(`${sourceId} 發送失敗, 下次再發送`);
      }
    })
  );
};

function fixFlexMessage(responses) {
  return responses.map(res => {
    if (["bubble", "carousel"].includes(res.type)) {
      return { type: "flex", altText: "快訊消息", contents: res };
    } else if (res.type === "flex") {
      return res.altText ? res : { altText: "快訊消息", ...res };
    }
    return res;
  });
}
