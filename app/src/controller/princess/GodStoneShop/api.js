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

/**
 * Express 4 不會接住 async handler 回傳的 rejected promise —— 沒有這層包裝，
 * 一次 DB 失敗就是 unhandled rejection：請求永遠掛著直到客戶端逾時，
 * 而 process 層級的 unhandledRejection 在 Node 上預設會讓整個 bot 行程結束。
 * 交給 next(err) 由 Express 的預設 error handler 回 500。
 *
 * 與 router/race.js、router/PublicMarket 用的是同一個三行寫法，
 * 刻意各自留在自己的檔案裡 —— 抽成共用模組只是替三行程式碼多開一個 import。
 */
const asyncHandler = fn => (req, res, next) => fn(req, res, next).catch(next);

ShopRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const itemList = await GodStoneShopModel.all();
    res.json(itemList);
  })
);

ShopRouter.post("/purchase", verifyToken, asyncHandler(exchangeItem));

ShopRouter.get("/history", verifyToken, asyncHandler(history));

AdminRouter.post("/items", asyncHandler(addGodStoneShopItem));
AdminRouter.delete("/items/:id", asyncHandler(destroyGodStoneShopItem));
AdminRouter.put("/items/:id", asyncHandler(updateGodStoneShopItem));

router.use("/god-stone-shop", ShopRouter);
router.use("/admin/god-stone-shop", AdminRouter);

module.exports = router;
