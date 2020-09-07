const GroupConfigModel = require("../../model/application/GuildConfig");
const { Line } = require("../../util/validation");
const { verifyGroupId } = Line;
const discord = require("../../util/discord");

function GroupConfigException(message, code) {
  this.code = code;
  this.message = message;
  this.name = "GroupConfig";
}

exports.switchConfig = (groupId, name, status) => {
  if (!verifyGroupId(groupId)) throw new GroupConfigException("Invalid groupId", 1);
  if (/^[YN]$/.test(status) === false) throw new GroupConfigException("Invalid Status.", 2);

  return GroupConfigModel.writeConfig(groupId, name, status);
};

exports.api = {};
exports.api.switchConfig = async (req, res) => {
  try {
    const { groupId, name, status } = req.params;
    await this.switchConfig(groupId, name, status == 1 ? "Y" : "N");
    res.json({});
  } catch (e) {
    if (e.name !== "GroupConfig") throw e;

    res.status(403).json({
      status: "fail",
      code: e.code,
      errMsg: e.message,
    });
  }
};

exports.api.fetchConfig = async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!verifyGroupId(groupId)) throw new GroupConfigException("Invalid groupId", 1);

    const [GroupConfig, DiscordWebhook, WelcomeMessage] = await Promise.all([
      GroupConfigModel.fetchConfig(groupId),
      GroupConfigModel.getDiscordWebhook(groupId),
      GroupConfigModel.getWelcomeMessage(groupId),
    ]);
    res.json({
      GroupConfig,
      DiscordWebhook,
      WelcomeMessage,
    });
  } catch (e) {
    if (e.name !== "GroupConfig") throw e;

    res.status(403).json({
      status: "fail",
      code: e.code,
      errMsg: e.message,
    });
  }
};

exports.api.setDiscordWebhook = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { webhook } = req.body;
    if (!verifyGroupId(groupId)) throw new GroupConfigException("Invalid groupId", 1);

    await GroupConfigModel.setDiscordWebhook(groupId, webhook);
    discord.webhook.send(webhook, {
      content: "與LINE機器人綁定成功！",
      username: "Re:Dive Bot",
    });
    res.json({});
  } catch (e) {
    if (e.name !== "GroupConfig") throw e;

    res.status(403).json({
      status: "fail",
      code: e.code,
      errMsg: e.message,
    });
  }
};

exports.api.removeDiscordWebhook = async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!verifyGroupId(groupId)) throw new GroupConfigException("Invalid groupId", 1);

    await GroupConfigModel.removeDicordWebhook(groupId);
    res.json({});
  } catch (e) {
    if (e.name !== "GroupConfig") throw e;

    res.status(403).json({
      status: "fail",
      code: e.code,
      errMsg: e.message,
    });
  }
};

exports.api.setWelcomeMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { message } = req.body;
    if (!verifyGroupId(groupId)) throw new GroupConfigException("Invalid groupId", 1);

    await GroupConfigModel.setWelcomeMessage(groupId, message);
    res.json({});
  } catch (e) {
    if (e.name !== "GroupConfig") throw e;

    res.status(403).json({
      status: "fail",
      code: e.code,
      errMsg: e.message,
    });
  }
};
