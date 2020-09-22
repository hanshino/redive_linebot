const express = require("express");
const router = express.Router();
const GroupRecordController = require("../controller/application/GroupRecord");
const CustomerOrderController = require("../controller/application/CustomerOrder");
const GroupConfigController = require("../controller/application/GroupConfig");
const GlobalOrdersController = require("../controller/application/GlobalOrders");
const GuildController = require("../controller/application/Guild");
const GroupConfig = require("../../doc/GroupConfig.json");
const {
  verifyToken,
  verifyAdmin,
  verifyId,
  verifyLineGroupId,
} = require("../middleware/validation");
const gacha = require("../controller/princess/gacha");
const { webhook } = require("../util/discord");
const { showStatistics, showUserStatistics } = require("../controller/application/Statistics");

router.get("/Group/:groupId/Speak/Rank", GroupRecordController.getRankDatas);

/** Customer Orders */
router.get(
  "/Source/:sourceId/Customer/Orders",
  (req, res, next) => verifyId(req.params.sourceId, res, next),
  CustomerOrderController.api.fetchCustomerOrders
);
router.post(
  "/Source/:sourceId/Customer/Orders",
  (req, res, next) => verifyId(req.params.sourceId, res, next),
  verifyToken,
  CustomerOrderController.api.insertOrder
);

/**
 * 更新指令內容
 */
router.put(
  "/Source/:sourceId/Customer/Orders",
  (req, res, next) => verifyId(req.params.sourceId, res, next),
  verifyToken,
  CustomerOrderController.api.updateOrder
);

/**
 * 修改指令狀態
 */
router.put(
  "/Source/:sourceId/Customer/Orders/:orderKey/:status",
  (req, res, next) => verifyId(req.params.sourceId, res, next),
  verifyToken,
  CustomerOrderController.api.setCustomerOrderStatus
);
/** Customer Orders */

/**
 * 設定群組發送人
 */
router.put(
  "/Group/:groupId/Sender",
  (req, res, next) => verifyLineGroupId(req.params.groupId, res, next),
  verifyToken,
  GroupConfigController.api.setSender
);

/**
 * 群組功能開關切換
 */
router.put(
  "/Group/:groupId/Name/:name/:status",
  (req, res, next) => verifyLineGroupId(req.params.groupId, res, next),
  verifyToken,
  GroupConfigController.api.switchConfig
);

/**
 * 群組 Discord Webhook 連動設定
 */
router.post(
  "/Group/:groupId/Discord/Webhook",
  (req, res, next) => verifyLineGroupId(req.params.groupId, res, next),
  verifyToken,
  GroupConfigController.api.setDiscordWebhook
);

/**
 * 群組加入新成員歡迎語句設定
 */
router.post(
  "/Group/:groupId/WelcomeMessage",
  (req, res, next) => verifyLineGroupId(req.params.groupId, res, next),
  verifyToken,
  GroupConfigController.api.setWelcomeMessage
);

/**
 * 群組 Discord Webhook 解除設定
 */
router.delete(
  "/Group/:groupId/Discord/Webhook",
  (req, res, next) => verifyLineGroupId(req.params.groupId, res, next),
  verifyToken,
  GroupConfigController.api.removeDiscordWebhook
);
router.post("/Discord/Webhook", (req, res) => {
  webhook
    .test(req.body.webhook)
    .then(isSuccess => res.status(isSuccess ? 200 : 403).send(""))
    .catch(err => {
      console.error(err);
      res.status(403).send("");
    });
});
router.get("/Group/:groupId/Config", GroupConfigController.api.fetchConfig);
router.get("/GroupConfig", (req, res) => res.json(GroupConfig));
router.get("/Admin/GachaPool/Data", verifyToken, verifyAdmin, gacha.api.showGachaPool);
router.put("/Admin/GachaPool/Data", verifyToken, verifyAdmin, gacha.api.updateCharacter);
router.post("/Admin/GachaPool/Data", verifyToken, verifyAdmin, gacha.api.insertCharacter);
router.delete("/Admin/GachaPool/Data/:id", verifyToken, verifyAdmin, gacha.api.deleteCharacter);
router.get(
  "/Admin/GlobalOrders/Data",
  verifyToken,
  verifyAdmin,
  GlobalOrdersController.api.showGlobalOrders
);
router.post(
  "/Admin/GlobalOrders/Data",
  verifyToken,
  verifyAdmin,
  GlobalOrdersController.api.insertGlobalOrders
);
router.put(
  "/Admin/GlobalOrders/Data",
  verifyToken,
  verifyAdmin,
  GlobalOrdersController.api.updateGlobalOrders
);
router.delete(
  "/Admin/GlobalOrders/Data/:orderKey",
  verifyToken,
  verifyAdmin,
  GlobalOrdersController.api.deleteGlobalOrders
);
router.get("/Gacha/Rank/:type", gacha.api.showGachaRank);
router.get("/Pudding/Statistics", showStatistics);
router.get("/My/Statistics", verifyToken, showUserStatistics);

router.get("/Guild/Summarys", verifyToken, GuildController.api.getGuildSummarys);
router.get(
  "/Guild/:guildId/Summary",
  (req, res, next) => verifyLineGroupId(req.params.guildId, res, next),
  verifyToken,
  GuildController.api.getGuildSummary
);

router.all("*", (req, res) => {
  res.status(404).json({ message: "invalid api url." });
});

module.exports = router;
