const random = require("math-random");
const { assemble } = require("../common/index");
const CharacterModel = require("../../model/princess/character");

/**
 * 發送訊息整合，整合多平台發送方式
 * @param {Context} context
 * @param {Array.<Object>} replyData
 * @param {String|Number} replyData.no
 * @param {String} replyData.messageType
 * @param {String} replyData.reply
 * @param {Object} sender
 * @param {String} sender.name
 * @param {String} sender.iconUrl
 */
exports.send = (context, replyDatas, sender = {}) => {
  replyDatas
    .sort((a, b) => a.no - b.no)
    .forEach(data => {
      switch (data.messageType) {
        case "image":
          _sendImage(context, data.reply, sender);
          return;
        case "text":
          context.sendText(handleText(data.reply, context), { sender });
          return;
      }
    });
};

/**
 * 處理字串中特殊關鍵字
 * @param {String} text
 * @param {Context} context 用於取得使用者姓名
 */
function handleText(text, context) {
  _handlePrincess();
  _handleRandomData();
  _handleRandomNum();

  let curr = new Date();

  text = assemble(
    {
      user: getUserName(context),
      time: getTime(curr),
      fulltime: getFullTime(curr),
    },
    text
  );

  return text;

  function _handlePrincess() {
    var princessDatas = CharacterModel.getDatas();

    text = text.replace(
      /\{princess\}/gi,
      () => princessDatas[getRandom(princessDatas.length - 1, 0)].Name
    );

    text = text.replace(/\{urprincess\}/gi, () => {
      let urPrincess = princessDatas.filter(data => data.Star === 3);
      console.log(64);
      return urPrincess[getRandom(urPrincess.length - 1, 0)].Name;
    });
  }

  function _handleRandomData() {
    text = text.replace(/\[.*?\]/g, matched => {
      matched = matched.replace(/[[\]]/g, "");
      let datas = matched.split(/,/);
      return datas[getRandom(datas.length - 1, 0)];
    });
  }

  function _handleRandomNum() {
    text = text.replace(/\{\s?\d{1,5}\s?,\s?\d{1,5}\s?\}/g, function (matched) {
      let strNums = matched;
      let nums = strNums.replace(/[{}]/g, "").split(",");
      return getRandom(parseInt(nums[1]), parseInt(nums[0])).toString();
    });
  }
}

function getTime(date) {
  return [
    ("0" + date.getHours()).substr(-2),
    ("0" + date.getMinutes()).substr(-2),
    ("0" + date.getSeconds()).substr(-2),
  ].join(":");
}

function getFullTime(date) {
  return (
    [
      date.getFullYear(),
      ("0" + (date.getMonth() + 1)).substr(-2),
      ("0" + date.getDate()).substr(-2),
    ].join("/") +
    " " +
    getTime(date)
  );
}

function getUserName(context) {
  switch (context.platform) {
    case "line":
      return context.state.userDatas[context.event.source.userId].displayName;
    case "telegram":
      return context.event.message.from.username;
  }
}

/**
 * 整合各平台發送圖片方式
 * @param {Context} context
 * @param {String} url
 * @param {Object} sender
 * @param {String} sender.name
 * @param {String} sender.iconUrl
 */
function _sendImage(context, url, sender) {
  switch (context.platform) {
    case "line":
      context.sendImage(
        {
          originalContentUrl: url,
          previewImageUrl: url,
        },
        {
          sender,
        }
      );
      break;
    case "telegram":
      context.sendPhoto(url);
      break;
    default:
      context.sendText(url);
      break;
  }
}

/**
 * Generate Random number between max and min.
 * @param {Number} max
 * @param {Number} min
 */
function getRandom(max, min) {
  if (min > max) {
    let temp;
    temp = min;
    min = max;
    max = temp;
  }

  let result = Math.round(random() * (max - min) + min);
  return result;
}
