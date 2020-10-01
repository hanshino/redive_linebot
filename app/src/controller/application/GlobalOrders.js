const OrderModel = require("../../model/application/GlobalOrders");
const random = require("math-random");
const { send } = require("../../templates/application/Order");
const { recordSign } = require("../../util/traffic");
const allowParameter = ["orderKey", "replyDatas", "senderIcon", "senderName", "touchType"];

function GlobalOrderException(message, code) {
  this.message = message;
  this.code = code;
}

exports.GlobalOrderBase = async (context, { next }) => {
  if (!context.event.isText) return next;
  if (context.state.guildConfig.GlobalOrder !== "Y") return next;
  const message = context.event.message.text;
  const GlobalOrders = await OrderModel.fetchAllData();

  var fullMatchResult = GlobalOrders.filter(order => {
    if (order.touchType === "1") return new RegExp(`^${order.order}$`, "i").test(message);
    return false;
  });

  var objOrder = null;

  if (fullMatchResult.length !== 0) {
    recordSign("GlobalOrder");
    objOrder = fullMatchResult[getRandom(fullMatchResult.length - 1)];
    send(context, objOrder.replyDatas, { name: objOrder.senderName, iconUrl: objOrder.senderIcon });
    return;
  }

  var matchResult = GlobalOrders.filter(order => {
    if (order.touchType === "2") return message.indexOf(order.order) !== -1;
    return false;
  });

  if (matchResult.length !== 0) {
    recordSign("GlobalOrder");
    objOrder = matchResult[getRandom(matchResult.length - 1)];
    send(context, objOrder.replyDatas, { name: objOrder.senderName, iconUrl: objOrder.senderIcon });
    return;
  }

  return next;
};

/**
 * Generate Random number between max and min.
 * @param {Number} max
 * @param {Number} min
 */
function getRandom(max, min = 0) {
  if (min > max) {
    let temp;
    temp = min;
    min = max;
    max = temp;
  }

  let result = Math.round(random() * (max - min) + min);
  return result;
}

exports.api = {};

exports.api.showGlobalOrders = async (req, res) => {
  const GlobalOrders = await OrderModel.fetchAllData();
  res.json(GlobalOrders);
};

exports.api.deleteGlobalOrders = async (req, res) => {
  const { orderKey } = req.params;
  var result = {};

  try {
    await OrderModel.deleteData(orderKey);
  } catch (e) {
    if (!(e instanceof GlobalOrderException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
};

exports.api.insertGlobalOrders = async (req, res) => {
  var objData = req.body;
  var result = {};

  try {
    var objDefault = {};
    allowParameter.forEach(attr => {
      objDefault[attr] = "";
    });

    objData = { ...objDefault, ...objData };
    objData.replyDatas = objData.replyDatas.slice(0, 5);

    if (objData.senderName === "") delete objData.senderName;
    if (objData.senderIcon === "") delete objData.senderIcon;

    await OrderModel.insertData(objData);
  } catch (e) {
    if (!(e instanceof GlobalOrderException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
};

exports.api.updateGlobalOrders = async (req, res) => {
  var objData = req.body;
  var result = {};

  try {
    var objDefault = {};
    allowParameter.forEach(attr => {
      objDefault[attr] = "";
    });

    objData = { ...objDefault, ...objData };

    if (objData.orderKey.trim() === "") throw new GlobalOrderException("Order Key Missing.", 1);
    objData.replyDatas = objData.replyDatas.slice(0, 5);

    await OrderModel.updateData(objData);
  } catch (e) {
    if (!(e instanceof GlobalOrderException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
};
