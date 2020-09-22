const GroupConfigModel = require("../../model/application/GuildConfig");
const { Line } = require("../../util/validation");
const { verifyGroupId } = Line;
const discord = require("../../util/discord");

function GroupConfigException(message, code) {
  this.code = code;
  this.message = message;
  this.name = "GroupConfig";
}

function isPicture(url) {
  return /^https:.*?(jpg|jpeg|tiff|png)$/i.test(url);
}

exports.setSender = async (
  context,
  {
    match: {
      groups: { param1, param2 },
    },
  }
) => {
  try {
    let name, iconUrl;

    if (param1 === undefined)
      throw new GroupConfigException(
        "使用方式：\n#自訂頭像 名稱 圖片\n#自訂頭像 名稱\n#自訂頭像 圖片"
      );

    if (isPicture(param1)) {
      iconUrl = param1;
      name = param2;
    } else {
      name = param1;
      iconUrl = param2;
    }

    if (name !== undefined && name.length > 20)
      throw new GroupConfigException(`錯誤名稱：${name}\n名稱不行超過20個字`);

    if (iconUrl !== undefined && !isPicture(iconUrl))
      throw new GroupConfigException(`錯誤圖片網址：${iconUrl}\n網址輸入錯誤`);

    let sender = context.state.sender || {};

    if (name !== undefined) sender.name = name;
    if (iconUrl !== undefined) sender.iconUrl = iconUrl;

    if (context.event.source.type !== "group") {
      context.sendText("設定成功！\n注意：非群組用戶，自訂頭像非永久性！", { sender });
      return;
    }

    if (name === undefined) {
      await GroupConfigModel.setSenderIcon(context.event.source.groupId, iconUrl);
    } else if (iconUrl === undefined) {
      await GroupConfigModel.setSenderName(context.event.source.groupId, name);
    } else {
      await GroupConfigModel.setSender(context.event.source.groupId, { name, icon: iconUrl });
    }

    context.sendText("設定成功！", { sender });
  } catch (e) {
    if (e.name !== "GroupConfig") throw e;
    context.sendText(e.message);
  }
};

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

    const [GroupConfig, DiscordWebhook, WelcomeMessage, Sender] = await Promise.all([
      GroupConfigModel.fetchConfig(groupId),
      GroupConfigModel.getDiscordWebhook(groupId),
      GroupConfigModel.getWelcomeMessage(groupId),
      GroupConfigModel.getSender(groupId, { cache: false }),
    ]);
    res.json({
      GroupConfig,
      DiscordWebhook,
      WelcomeMessage,
      Sender,
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

exports.api.setSender = async (req, res) => {
  const { groupId } = req.params;
  const { name, iconUrl } = req.body;
  try {
    if (!/^.{0,20}$/.test(name)) throw new GroupConfigException("Bad Request.", 400);
    if (iconUrl !== "" && !isPicture(iconUrl)) throw new GroupConfigException("Bad Request.", 400);

    let param = {};

    param.name = name === "" ? undefined : name;
    param.icon = iconUrl === "" ? undefined : iconUrl;

    await GroupConfigModel.setSender(groupId, param);

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
