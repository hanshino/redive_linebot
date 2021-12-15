const { CustomLogger } = require("../../util/Logger");
const LineNotify = require("../../util/LineNotify");
const NotifyModel = require("../../model/application/NotifyModel");
const UserModel = require("../../model/application/UserModel");
const SubscribeType = require("../../../doc/SubscribeType.json");

exports.api = {};

exports.api.revokeBinding = async (req, res) => {
  try {
    const { userId } = req.profile;
    let notifyData = await getData(userId);

    await LineNotify.revokeToken(notifyData.token);
    await NotifyModel.closeNotify(notifyData.id);

    res.json({});
  } catch (e) {
    console.error(e);
    res.status(400);
    res.json({ message: "failed" });
  }
};

exports.api.messageTest = (req, res) => {
  const { userId } = req.profile;
  getData(userId).then(notifyData => {
    if (!notifyData) {
      res.status(404);
    } else {
      let { token } = notifyData;
      console.log(notifyData);
      LineNotify.pushMessage({ message: "訊息推送測試！", token });
    }
    res.send("");
  });
};

/**
 * @param {Request} req
 * @param {Response} res
 */
exports.api.binding = async (req, res) => {
  const { code, state: userId } = req.query;
  let resultMessage = "綁定成功～！";

  try {
    if (!userId || /^U[a-f0-9]{32}/.test(userId) === false) throw "userId is invalid.";
    if (!code) throw "Code is empty.";

    const token = await LineNotify.queryToken(code);

    if (!token) throw "Token is empty";

    let id = await UserModel.getId(userId);

    if (!id) {
      await LineNotify.revokeToken(token);
      throw "Cant get User id. Maybe not friend.";
    }

    await NotifyModel.bindingLineNotify(id, token);
    await LineNotify.pushMessage({
      message: "綁定成功！現在為訊息推送測試！",
      token,
    }).catch(() => {
      resultMessage =
        "綁定成功！但測試訊息發送失敗！如綁定群組，請記得邀請Line Notify官方帳號進入群組！";
    });
  } catch (e) {
    CustomLogger.error("[Binding Page]", e, "userId =>", userId, "code =>", code);
    resultMessage = "發生錯誤！請通知作者！";
  }

  res.send(
    `<h3>${resultMessage}</h3><h4>1秒後即將導頁</h4><script>setTimeout(function() {location.href="/Bot/Notify";}, 1500)</script>`
  );
};

exports.api.getUserData = async (req, res) => {
  const { userId } = req.profile;
  let data = await getData(userId);

  if (!data) {
    res.status(404);
  } else {
    delete data.token;
    data.subData = getSubData(data.subType);
  }

  res.json(data || {});
};

exports.api.setSubStatus = async (req, res) => {
  try {
    const { key, status } = req.params;
    const { userId } = req.profile;

    if (!isValidSubType(key)) {
      res.status(400);
      res.json({ message: "Bad Request." });
      return;
    }

    let data = await getData(userId);
    if (!data) {
      res.status(404);
      res.json({ message: "Not Found" });
      return;
    }

    let diff = getDiffSubType({ key, status: parseInt(status), origin: data.subType });
    await setSubStatus({ ...data, diff });
    await sendModifyStatusNotify({ ...data, key, status });

    res.send("{}");
  } catch (e) {
    console.error(e);
    res.json({ message: "unknown error" });
  }
};

/**
 * 異動訂閱種類
 * @param {Object} objData
 * @param {Number} objData.id
 * @param {Number} objData.diff
 */
function setSubStatus({ id, diff }) {
  let objData = { id, sub_type: diff };
  return NotifyModel.setSubStatus(objData);
}

/**
 * 發送異動消息通知
 * @param {Object} objData
 * @param {String} objData.key
 * @param {Number} objData.status
 * @param {String} objData.token
 * @returns {Promise}
 */
function sendModifyStatusNotify({ key, status, token }) {
  let subType = SubscribeType.find(data => data.key === key);
  let messages = [subType.title];
  messages.push(parseInt(status) === 1 ? "已開啟" : "已關閉");

  return LineNotify.pushMessage({ message: messages.join(""), token });
}

/**
 * 根據關閉的類型，推算出異動後的數字
 * @param {Object} objData
 * @param {String} objData.key
 * @param {Number} objData.status
 * @param {Number} objData.origin
 * @returns {Number} diff. return 0 on fail
 */
function getDiffSubType({ key, status, origin }) {
  const SubSwitch = getSubSwitch();
  const subDatas = getSubData(origin);

  subDatas.forEach(data => {
    let idx = SubscribeType.findIndex(d => d.key === data.key);
    SubSwitch[idx] = data.status;
  });

  let idx = SubscribeType.findIndex(data => data.key === key);

  if (idx === -1) return 0;

  SubSwitch[idx] = status;
  return parseInt(SubSwitch.join(""), 2);
}

/**
 * 檢查訂閱類型的合法性
 * @param {String} key 訂閱類型的key
 */
function isValidSubType(key) {
  return SubscribeType.map(data => data.key).includes(key);
}

async function getData(userId) {
  let id = await UserModel.getId(userId);
  let data = await NotifyModel.getData(id);
  return data.length !== 0 ? data[0] : null;
}

/**
 * 訂閱類型轉譯成資料
 * @param {Number} subType
 */
function getSubData(subType) {
  const SubSwitch = getSubSwitch();
  let switchAry = SubSwitch.join("") + subType.toString(2);
  switchAry = switchAry.substr(SubSwitch.length * -1).split("");
  return SubscribeType.map((data, index) => ({ ...data, status: parseInt(switchAry[index]) }));
}

/**
 * 訂閱類型轉譯成數字
 * @param {Array<{key:String, status:Number}>} switchArray
 */
// eslint-disable-next-line no-unused-vars
function getSubType(switchArray) {
  const SubSwitch = getSubSwitch();
  switchArray.forEach(data => {
    let idx = SubscribeType.findIndex(typeData => typeData.key === data.key);
    SubSwitch[idx] = data.status;
  });

  return parseInt(SubSwitch.join(""), 2);
}

function getSubSwitch() {
  return Array.from({ length: SubscribeType.length }).map(() => "0");
}

exports.getSubData = getSubData;
exports.getData = getData;
