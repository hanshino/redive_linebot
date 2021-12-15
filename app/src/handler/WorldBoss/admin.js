const WorldBossModel = require("../../model/application/WorldBoss");
const i18n = require("../../util/i18n");

exports.getAllWorldBoss = async (req, res) => {
  let worldBoss = await WorldBossModel.all();
  res.json(worldBoss);
};

exports.storeWorldBoss = async (req, res) => {
  let worldBoss = await WorldBossModel.create(req.body);
  res.json(worldBoss);
};

exports.updateWorldBoss = async (req, res) => {
  const { id } = req.params;
  try {
    await WorldBossModel.update(id, req.body);
    res.json({});
  } catch (e) {
    res.status(500).json({
      message: i18n.t("api.error.unknown"),
    });
  }
};

exports.deleteWorldBoss = async (req, res) => {
  const { id } = req.params;
  try {
    await WorldBossModel.destory(id);
    res.json({});
  } catch (e) {
    res.status(500).json({
      message: i18n.t("api.error.unknown"),
    });
  }
};
