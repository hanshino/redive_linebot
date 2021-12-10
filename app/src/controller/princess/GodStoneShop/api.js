const router = require("express").Router();
const GodStoneShopModel = require("../../../model/princess/GodStoneShop");
const CharacterModel = require("../../../model/princess/character");

router.get("/", async (req, res) => {
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

module.exports = router;
