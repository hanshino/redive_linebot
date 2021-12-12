const createRouter = require("express").Router;
const ShopRouter = createRouter();
// const AdminRouter = createRouter();
const GodStoneShopModel = require("../../../model/princess/GodStoneShop");
const CharacterModel = require("../../../model/princess/character");
const { verifyToken } = require("../../../middleware/validation");
const { exchangeItem, history } = require("./handler");
const router = createRouter();

ShopRouter.get("/", async (req, res) => {
  const itemList = await GodStoneShopModel.all();

  const result = itemList.map(item => {
    const { Image: image, Star: star } = CharacterModel.findByName(item.name);

    return {
      ...item,
      image,
      star,
    };
  });

  res.json(result);
});

ShopRouter.post("/purchase", verifyToken, exchangeItem);

ShopRouter.get("/history", verifyToken, history);

router.use("/GodStoneShop", ShopRouter);

module.exports = router;
