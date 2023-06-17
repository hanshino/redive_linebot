const uidModel = require("../../model/princess/uid");

/**
 * @deprecated 本功能已無法繼續維護
 */
exports.showCard = async context => {
  return await context.replyText("本功能已無法繼續維護，暫時不會有更新的消息，請見諒。");
};

exports.api = {};

exports.api.getData = async (req, res) => {
  let { userId } = req.profile;
  let bindData = await uidModel.getData(userId);

  let result = bindData || {};

  res.json(result);
};

exports.api.binding = async (req, res) => {
  let { uid, server, background } = req.body;
  let { userId } = req.profile;

  let nickname = await uidModel.getPrincessNickName(uid, server);
  if (!nickname) {
    res.status(400).json({ message: "綁定失敗，請確認uid與伺服器是否正確！" });
    return;
  }

  let result = await uidModel.binding({ uid, userId, server, background }).catch(() => false);

  if (result === false) {
    res.status(401).json({ message: "binding failed" });
    return;
  }

  res.status(201).json({});
};

exports.api.clearBinding = async (req, res) => {
  let { userId } = req.profile;
  let result = await uidModel.cleanBinding(userId).catch(() => false);

  if (result === false) {
    res.status(401).json({ message: "reset failed" });
    return;
  }

  res.json({});
};
