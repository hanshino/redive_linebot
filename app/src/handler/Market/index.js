const MarketDetailModel = require("../../model/application/MarketDetail");
exports.show = async (req, res) => {
  const { id } = req.params;
  const marketDetail = await MarketDetailModel.getById(id);

  res.json(marketDetail);
};
