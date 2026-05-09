const OrderModel = require("../../model/application/GlobalOrders");
const random = require("math-random");
const { send } = require("../../templates/application/Order");
const { recordSign } = require("../../util/traffic");
const umami = require("../../util/umami");
const allowParameter = ["orderKey", "replyDatas", "senderIcon", "senderName", "touchType", "order"];
const MAX_REPLIES = 5;

function GlobalOrderException(message, code) {
  this.message = message;
  this.code = code;
}

exports.GlobalOrderBase = async (context, { next }) => {
  if (!context.event.isText) return next;
  if (context.state.guildConfig.GlobalOrder !== "Y") return next;
  const message = context.event.message.text;
  const GlobalOrders = await OrderModel.fetchAllData();

  var fullMatchResult = GlobalOrders.filter(orderData => {
    let { order, touchType } = orderData;
    order = order.toUpperCase();
    let msg = message.toUpperCase();
    if (touchType === "1") return order === msg;
    return false;
  });

  if (fullMatchResult.length !== 0) {
    recordSign("GlobalOrder");
    umami.track("global_order_hit", "/bot/application/global_order", umami.getSourceData(context));
    const objOrder = fullMatchResult[getRandom(fullMatchResult.length - 1)];
    send(context, objOrder.replyDatas, { name: objOrder.senderName, iconUrl: objOrder.senderIcon });
    return;
  }

  var matchResult = GlobalOrders.filter(order => {
    if (order.touchType === "2") return message.indexOf(order.order) !== -1;
    return false;
  });

  if (matchResult.length !== 0) {
    recordSign("GlobalOrder");
    umami.track("global_order_hit", "/bot/application/global_order", umami.getSourceData(context));
    const objOrder = matchResult[getRandom(matchResult.length - 1)];
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

/**
 * Normalize incoming admin payload so `undefined` never reaches Knex
 * (Knex throws "Undefined binding(s) detected" on undefined values) and
 * NOT NULL columns always receive a sensible default.
 */
function sanitizePayload(body) {
  const objDefault = {};
  allowParameter.forEach(attr => {
    objDefault[attr] = "";
  });
  const obj = { ...objDefault, ...body };

  obj.replyDatas = Array.isArray(obj.replyDatas) ? obj.replyDatas.slice(0, MAX_REPLIES) : [];
  obj.replyDatas = obj.replyDatas.map(d => ({
    messageType:
      typeof d?.messageType === "string" && d.messageType.trim() ? d.messageType : "text",
    reply: typeof d?.reply === "string" ? d.reply : "",
  }));

  obj.senderName = obj.senderName === "" ? null : obj.senderName;
  obj.senderIcon = obj.senderIcon === "" ? null : obj.senderIcon;
  obj.touchType = obj.touchType || "1";

  return obj;
}

exports.api = {};

exports.api.showGlobalOrders = async (req, res) => {
  const GlobalOrders = await OrderModel.fetchAllData();
  res.json(GlobalOrders);
};

exports.api.deleteGlobalOrders = async (req, res, next) => {
  const { orderKey } = req.params;

  try {
    await OrderModel.deleteData(orderKey);
    res.json({});
  } catch (e) {
    if (e instanceof GlobalOrderException) {
      return res.status(400).json({ message: e.message });
    }
    return next(e);
  }
};

exports.api.insertGlobalOrders = async (req, res, next) => {
  try {
    const objData = sanitizePayload(req.body);
    if (!objData.replyDatas.length) {
      throw new GlobalOrderException("至少需要一筆回覆", 2);
    }
    await OrderModel.insertData(objData);
    res.json({});
  } catch (e) {
    if (e instanceof GlobalOrderException) {
      return res.status(400).json({ message: e.message });
    }
    return next(e);
  }
};

exports.api.updateGlobalOrders = async (req, res, next) => {
  try {
    const objData = sanitizePayload(req.body);
    if (!objData.orderKey || objData.orderKey.trim() === "") {
      throw new GlobalOrderException("Order Key Missing.", 1);
    }
    if (!objData.replyDatas.length) {
      throw new GlobalOrderException("至少需要一筆回覆", 2);
    }
    await OrderModel.updateData(objData);
    res.json({});
  } catch (e) {
    if (e instanceof GlobalOrderException) {
      return res.status(400).json({ message: e.message });
    }
    return next(e);
  }
};
