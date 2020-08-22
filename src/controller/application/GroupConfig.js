const GroupConfigModel = require("../../model/application/GuildConfig");
const { Line } = require("../../util/validation");
const { verifyGroupId } = Line;

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
    console.log(status, typeof status);
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

    const GroupConfig = await GroupConfigModel.fetchConfig(groupId);
    res.json(GroupConfig);
  } catch (e) {
    if (e.name !== "GroupConfig") throw e;

    res.status(403).json({
      status: "fail",
      code: e.code,
      errMsg: e.message,
    });
  }
};
