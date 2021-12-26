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

/**
 * 取得單一世界王事件
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.find = async (req, res) => {
  let result = await WorldbossEventService.find(req.params.id);
  res.json(result);
};

/**
 * 建立世界王事件
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.create = async (req, res) => {
  let data = req.body;
  data = {
    ...data,
    start_time: new Date(data.start_time),
    end_time: new Date(data.end_time),
  };
  let result = await WorldbossEventService.create(data);
  res.json(result);
};

/**
 * 更新世界王事件
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.update = async (req, res) => {
  let data = req.body;
  data = {
    ...data,
    start_time: new Date(data.start_time),
    end_time: new Date(data.end_time),
  };
  let result = await WorldbossEventService.update(req.params.id, data);
  res.json(result);
};

/**
 * 刪除世界王事件
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.destroy = async (req, res) => {
  let result = await WorldbossEventService.destroy(req.params.id);
  res.json(result);
};
