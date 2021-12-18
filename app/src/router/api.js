const express = require("express");
const router = express.Router();
const GroupRecordController = require("../controller/application/GroupRecord");
const CustomerOrderController = require("../controller/application/CustomerOrder");
const GroupConfigController = require("../controller/application/GroupConfig");
const GlobalOrdersController = require("../controller/application/GlobalOrders");
const GuildBattleController = require("../controller/princess/battle");
const GuildController = require("../controller/application/Guild");
const FriendCardController = require("../controller/princess/FriendCard");
const PrincessCharacterController = require("../controller/princess/character");
const GroupConfig = require("../../doc/GroupConfig.json");
const {
  verifyToken,
  verifyAdmin,
  verifyPrivilege,
  verifyId,
  verifyLineGroupId,
} = require("../middleware/validation");
const gacha = require("../controller/princess/gacha");
const { webhook } = require("../util/discord");
const { showStatistics, showUserStatistics } = require("../controller/application/Statistics");
const NotifyController = require("../controller/application/NotifyController");
const { binding } = require("../controller/application/NotifyController").api;
const ChatLevelController = require("../controller/application/ChatLevelController");
const AnnounceController = require("../controller/application/AnnounceController");
const WorldBossController = require("../controller/application/WorldBossController");
const { api: GodStoneShopRouter } = require("../controller/princess/GodStoneShop");
const AdminModel = require("../model/application/Admin");
const WorldBossRouter = require("./WorldBoss");
const ImgurRouter = require("./Imgur");

router.use(ImgurRouter);
router.use(WorldBossRouter);

router.use(GodStoneShopRouter);

router.get("/me", verifyToken, async (req, res) => {
  const { userId } = req.profile;
  const adminData = (await AdminModel.find(userId)) || {};

  res.json({
    ...req.profile,
    ...adminData,
  });
});

router.get("/send-id", (req, res) => {
  const { size } = req.query || "full";
  let liffId = "";

  switch (size.toLowerCase()) {
    case "compact":
      liffId = process.env.LINE_LIFF_COMPACT_ID;
      break;
    case "tall":
      liffId = process.env.LINE_LIFF_TALL_ID;
      break;
    case "full":
      liffId = process.env.LINE_LIFF_FULL_ID;
      break;
  }

  liffId = liffId || process.env.LINE_LIFF_ID;

  res.json({ id: liffId });
});

router.get("/Bot/Notify/Callback", binding);

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

/**
 * 綁定群組 Discord Webhook
 */
router.post("/Discord/Webhook", (req, res) => {
  webhook
    .test(req.body.webhook)
    .then(isSuccess => res.status(isSuccess ? 200 : 403).send(""))
    .catch(err => {
      console.error(err);
      res.status(403).send("");
    });
});

/**
 * 取得群組設定
 */
router.get("/Group/:groupId/Config", GroupConfigController.api.fetchConfig);

/**
 * 群組設定檔
 */
router.get("/GroupConfig", (req, res) => res.json(GroupConfig));

/**
 * 管理員轉蛋資料
 */
router.get(
  "/Admin/GachaPool/Data",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(1),
  gacha.api.showGachaPool
);

/**
 * 編輯管理員轉蛋資料
 */
router.put(
  "/Admin/GachaPool/Data",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(9),
  gacha.api.updateCharacter
);

/**
 * 新增管理員轉蛋資料
 */
router.post(
  "/Admin/GachaPool/Data",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(9),
  gacha.api.insertCharacter
);

/**
 * 刪除管理員轉蛋資料
 */
router.delete(
  "/Admin/GachaPool/Data/:id",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(9),
  gacha.api.deleteCharacter
);

/**
 * 取得管理員全群指令
 */
router.get(
  "/Admin/GlobalOrders/Data",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(1),
  GlobalOrdersController.api.showGlobalOrders
);

/**
 * 新增管理員全群指令
 */
router.post(
  "/Admin/GlobalOrders/Data",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(9),
  GlobalOrdersController.api.insertGlobalOrders
);

/**
 * 編輯管理員全群指令
 */
router.put(
  "/Admin/GlobalOrders/Data",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(9),
  GlobalOrdersController.api.updateGlobalOrders
);

/**
 * 刪除管理員全群指令
 */
router.delete(
  "/Admin/GlobalOrders/Data/:orderKey",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(9),
  GlobalOrdersController.api.deleteGlobalOrders
);

/**
 * 取得轉蛋排行
 */
router.get("/Gacha/Rank/:type", gacha.api.showGachaRank);

/**
 * 取得布丁使用數據
 */
router.get("/Pudding/Statistics", showStatistics);

/**
 * 取得個人用戶使用數據
 */
router.get("/My/Statistics", verifyToken, showUserStatistics);

/**
 * 取得個人群組資料
 */
router.get("/Guild/Summarys", verifyToken, GuildController.api.getGuildSummarys);

/**
 * 取得特定群組資訊
 */
router.get(
  "/Guild/:guildId/Summary",
  (req, res, next) => verifyLineGroupId(req.params.guildId, res, next),
  verifyToken,
  GuildController.api.getGuildSummary
);

/**
 * 取得群組三刀簽到表
 */
router.get(
  "/Guild/:guildId/Battle/Sign/List/Month/:month",
  (req, res, next) => verifyLineGroupId(req.params.guildId, res, next),
  GuildBattleController.api.showSigninList
);

/**
 * 群組戰隊設定資訊
 */
router.get(
  "/Guild/:guildId/Battle/Config",
  (req, res, next) => verifyLineGroupId(req.params.guildId, res, next),
  verifyToken,
  GuildBattleController.api.getGuildBattleConfig
);

router.put(
  "/Guild/:guildId/Battle/Config",
  (req, res, next) => verifyLineGroupId(req.params.guildId, res, next),
  verifyToken,
  GuildBattleController.api.updateGuildBattleConfig
);

router.post("/Princess/Friend/Card", verifyToken, FriendCardController.api.binding);

router.get("/Princess/Friend/Card", verifyToken, FriendCardController.api.getData);

router.get("/Princess/Character/Images", PrincessCharacterController.api.getCharacterImages);

router.delete("/Princess/Friend/Card", verifyToken, FriendCardController.api.clearBinding);

router.get("/Bot/Notify/Data", verifyToken, NotifyController.api.getUserData);

router.delete("/Bot/Notify/Binding", verifyToken, NotifyController.api.revokeBinding);

router.post("/Bot/Notify/Test", verifyToken, NotifyController.api.messageTest);

router.put("/Bot/Notify/:key/:status", verifyToken, NotifyController.api.setSubStatus);

router.get("/Chat/Level/Rank", ChatLevelController.api.queryRank);

router.get("/Announcement/:page", AnnounceController.api.queryData);

/**
 * 小遊戲 - 世界王
 */
// 輸出排行圖表
router.get("/Game/World/Boss/Rank/Chart", WorldBossController.api.genTopTenRankChart);
// 新增世界王傷害特色訊息
router.post(
  "/Game/World/Boss/Feature/Message",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(3),
  WorldBossController.api.createAttackMessage
);
// 取得世界王傷害特色訊息
router.get(
  "/Game/World/Boss/Feature/Message",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(1),
  WorldBossController.api.listAttackMessage
);
// 取得世界王傷害特色訊息 - 單筆
router.get(
  "/Game/World/Boss/Feature/Message/:id",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(1),
  WorldBossController.api.getAttackMessage
);
// 編輯世界王傷害特色訊息
router.put(
  "/Game/World/Boss/Feature/Message/:id",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(3),
  WorldBossController.api.updateAttackMessage
);
// 刪除世界王傷害特色訊息
router.delete(
  "/Game/World/Boss/Feature/Message/:id",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(3),
  WorldBossController.api.deleteAttackMessage
);

router.all("*", (_, res) => {
  res.status(404).json({ message: "invalid api url." });
});

module.exports = router;
