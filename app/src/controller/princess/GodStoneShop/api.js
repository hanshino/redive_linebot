const createRouter = require("express").Router;
const ShopRouter = createRouter();
const AdminRouter = createRouter();
const GodStoneShopModel = require("../../../model/princess/GodStoneShop");
const { verifyToken } = require("../../../middleware/validation");
const {
  exchangeItem,
  history,
  addGodStoneShopItem,
  destroyGodStoneShopItem,
  updateGodStoneShopItem,
} = require("./handler");
const router = createRouter();

ShopRouter.get("/", async (req, res) => {
  const itemList = await GodStoneShopModel.all();
  res.json(itemList);
});

ShopRouter.post("/purchase", verifyToken, exchangeItem);

ShopRouter.get("/history", verifyToken, history);

AdminRouter.post("/item", addGodStoneShopItem);
AdminRouter.delete("/item/:id", destroyGodStoneShopItem);
AdminRouter.put("/item/:id", updateGodStoneShopItem);

router.use("/GodStoneShop", ShopRouter);
router.use("/Admin/GodStoneShop", AdminRouter);

module.exports = router;
