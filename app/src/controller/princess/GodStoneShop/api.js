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

AdminRouter.post("/items", addGodStoneShopItem);
AdminRouter.delete("/items/:id", destroyGodStoneShopItem);
AdminRouter.put("/items/:id", updateGodStoneShopItem);

router.use("/god-stone-shop", ShopRouter);
router.use("/admin/god-stone-shop", AdminRouter);

module.exports = router;
