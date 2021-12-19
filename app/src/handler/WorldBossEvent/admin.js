const WorldbossEventService = require("../../service/WorldBossEventService");

/**
 * 取得所有的世界王事件
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.all = async (req, res) => {
  let result = await WorldbossEventService.all();
  res.json(result);
};
