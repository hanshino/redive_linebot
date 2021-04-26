const AnnounceModel = require("../../model/application/AnnounceModel");
exports.api = {};

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.api.queryData = async (req, res) => {
  let { page } = req.params;
  let result = await AnnounceModel.getData(page);

  res.json(result);
};
