const express = require("express");
const router = express.Router();
const GroupRecordController = require("../controller/application/GroupRecord");
const CustomerOrderController = require("../controller/application/CustomerOrder");
const GroupConfigController = require("../controller/application/GroupConfig");
const GlobalOrdersController = require("../controller/application/GlobalOrders");
const GuildBattleController = require("../controller/princess/battle");
const GuildController = require("../controller/application/Guild");
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
const GachaBannerController = require("../controller/princess/GachaBannerController");
const { webhook } = require("../util/discord");
const { showStatistics, showUserStatistics } = require("../controller/application/Statistics");
const ChatLevelController = require("../controller/application/ChatLevelController");
const AnnounceController = require("../controller/application/AnnounceController");
const WorldBossController = require("../controller/application/WorldBossController");
const { api: GodStoneShopRouter } = require("../controller/princess/GodStoneShop");
const AdminModel = require("../model/application/Admin");
const { admin: AdminWorldBossRouter } = require("./WorldBoss");
const ImgurRouter = require("./Imgur");
const { admin: AdminWorldBossEventRouter } = require("./WorldBossEvent");
const { admin: AdminEquipmentRouter, player: PlayerEquipmentRouter } = require("./Equipment");
const { router: InventoryRouter } = require("./Inventory");
const { router: TradeRouter } = require("./Trade");
const { router: MarketRouter } = require("./Market");
const moment = require("moment");
const XpHistoryService = require("../service/XpHistoryService");

router.use(MarketRouter);
router.use(InventoryRouter);
router.use(TradeRouter);
router.use(ImgurRouter);
router.use("/admin", verifyToken, verifyAdmin, verifyPrivilege(5));

router.use("/admin", AdminWorldBossRouter);
router.use("/admin", AdminWorldBossEventRouter);
router.use("/admin", AdminEquipmentRouter);

router.use(GodStoneShopRouter);
router.use("/game", verifyToken, PlayerEquipmentRouter);

router.get("/me", verifyToken, async (req, res) => {
  const { userId } = req.profile;
  const adminData = (await AdminModel.find(userId)) || {};

  res.json({
    ...req.profile,
    ...adminData,
  });
});

router.get("/me/xp-summary", verifyToken, async (req, res) => {
  try {
    const { userId } = req.profile;
    const summary = await XpHistoryService.buildSummary(userId);
    res.json(summary);
  } catch (e) {
    console.error("[xp-summary]", e);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/me/xp-events", verifyToken, async (req, res) => {
  try {
    const { userId } = req.profile;
    const today = moment().utcOffset(480).format("YYYY-MM-DD");
    const from = (req.query.from || today).slice(0, 10);
    const to = (req.query.to || today).slice(0, 10);

    // 7-day window cap
    const fromM = moment(from);
    const toM = moment(to);
    if (!fromM.isValid() || !toM.isValid() || toM.diff(fromM, "days") > 7) {
      return res.status(400).json({ error: "range must be ≤ 7 days" });
    }

    const result = await XpHistoryService.buildEvents(userId, {
      from,
      to,
      limit: Math.min(Number(req.query.limit) || 1000, 1000),
      beforeId: req.query.beforeId ? Number(req.query.beforeId) : null,
      beforeTs: req.query.beforeTs || null,
    });
    res.json(result);
  } catch (e) {
    console.error("[xp-events]", e);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/me/xp-daily", verifyToken, async (req, res) => {
  try {
    const { userId } = req.profile;
    const today = moment().utcOffset(480).format("YYYY-MM-DD");
    const from = (req.query.from || moment(today).subtract(29, "days").format("YYYY-MM-DD")).slice(
      0,
      10
    );
    const to = (req.query.to || today).slice(0, 10);

    const fromM = moment(from);
    const toM = moment(to);
    if (!fromM.isValid() || !toM.isValid() || toM.diff(fromM, "days") > 365) {
      return res.status(400).json({ error: "range must be ≤ 365 days" });
    }

    const result = await XpHistoryService.buildDaily(userId, { from, to });
    res.json(result);
  } catch (e) {
    console.error("[xp-daily]", e);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/liff-ids", (req, res) => {
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

router.get("/groups/:groupId/speak-rank", GroupRecordController.getRankDatas);

/** Customer Orders */
router.get(
  "/sources/:sourceId/custom-orders",
  (req, res, next) => verifyId(req.params.sourceId, res, next),
  CustomerOrderController.api.fetchCustomerOrders
);
router.post(
  "/sources/:sourceId/custom-orders",
  (req, res, next) => verifyId(req.params.sourceId, res, next),
  verifyToken,
  CustomerOrderController.api.insertOrder
);

/**
 * 更新指令內容
 */
router.put(
  "/sources/:sourceId/custom-orders",
  (req, res, next) => verifyId(req.params.sourceId, res, next),
  verifyToken,
  CustomerOrderController.api.updateOrder
);

/**
 * 修改指令狀態
 */
router.put(
  "/sources/:sourceId/custom-orders/:orderKey/status",
  (req, res, next) => verifyId(req.params.sourceId, res, next),
  verifyToken,
  CustomerOrderController.api.setCustomerOrderStatus
);
/** Customer Orders */

/**
 * 設定群組發送人
 */
router.put(
  "/groups/:groupId/sender",
  (req, res, next) => verifyLineGroupId(req.params.groupId, res, next),
  verifyToken,
  GroupConfigController.api.setSender
);

/**
 * 群組功能開關切換
 */
router.put(
  "/groups/:groupId/features/:name/:status",
  (req, res, next) => verifyLineGroupId(req.params.groupId, res, next),
  verifyToken,
  GroupConfigController.api.switchConfig
);

/**
 * 群組 Discord Webhook 連動設定
 */
router.post(
  "/groups/:groupId/discord-webhook",
  (req, res, next) => verifyLineGroupId(req.params.groupId, res, next),
  verifyToken,
  GroupConfigController.api.setDiscordWebhook
);

/**
 * 群組加入新成員歡迎語句設定
 */
router.post(
  "/groups/:groupId/welcome-message",
  (req, res, next) => verifyLineGroupId(req.params.groupId, res, next),
  verifyToken,
  GroupConfigController.api.setWelcomeMessage
);

/**
 * 群組 Discord Webhook 解除設定
 */
router.delete(
  "/groups/:groupId/discord-webhook",
  (req, res, next) => verifyLineGroupId(req.params.groupId, res, next),
  verifyToken,
  GroupConfigController.api.removeDiscordWebhook
);

/**
 * 綁定群組 Discord Webhook
 */
router.post("/discord/webhook-test", (req, res) => {
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
router.get("/groups/:groupId/config", GroupConfigController.api.fetchConfig);

/**
 * 群組設定檔
 */
router.get("/group-config", (req, res) => res.json(GroupConfig));

/**
 * 管理員轉蛋資料
 */
router.get("/admin/gacha-pool", verifyPrivilege(1), gacha.api.showGachaPool);

/**
 * 編輯管理員轉蛋資料
 */
router.put("/admin/gacha-pool", verifyPrivilege(9), gacha.api.updateCharacter);

/**
 * 新增管理員轉蛋資料
 */
router.post("/admin/gacha-pool", verifyPrivilege(9), gacha.api.insertCharacter);

/**
 * 刪除管理員轉蛋資料
 */
router.delete("/admin/gacha-pool/:id", verifyPrivilege(9), gacha.api.deleteCharacter);

/**
 * 轉蛋 Banner 管理
 */
router.get("/admin/gacha-banners", verifyPrivilege(1), GachaBannerController.listBanners);
router.get("/admin/gacha-banners/:id", verifyPrivilege(1), GachaBannerController.getBanner);
router.post("/admin/gacha-banners", verifyPrivilege(9), GachaBannerController.createBanner);
router.put("/admin/gacha-banners/:id", verifyPrivilege(9), GachaBannerController.updateBanner);
router.delete("/admin/gacha-banners/:id", verifyPrivilege(9), GachaBannerController.deleteBanner);

/**
 * 取得管理員全群指令
 */
router.get("/admin/global-orders", verifyPrivilege(1), GlobalOrdersController.api.showGlobalOrders);

/**
 * 新增管理員全群指令
 */
router.post(
  "/admin/global-orders",
  verifyPrivilege(9),
  GlobalOrdersController.api.insertGlobalOrders
);

/**
 * 編輯管理員全群指令
 */
router.put(
  "/admin/global-orders",
  verifyPrivilege(9),
  GlobalOrdersController.api.updateGlobalOrders
);

/**
 * 刪除管理員全群指令
 */
router.delete(
  "/admin/global-orders/:orderKey",
  verifyPrivilege(9),
  GlobalOrdersController.api.deleteGlobalOrders
);

/**
 * 取得轉蛋排行
 */
router.get("/gacha/rankings/:type", gacha.api.showGachaRank);

/**
 * 取得女神石排行榜
 */
router.get("/god-stone/rankings", gacha.api.showGodStoneRank);

/**
 * 取得布丁使用數據
 */
router.get("/statistics", showStatistics);

/**
 * 取得個人用戶使用數據
 */
router.get("/users/me/statistics", verifyToken, showUserStatistics);

/**
 * 取得個人群組資料
 */
router.get("/guilds", verifyToken, GuildController.api.getGuildSummarys);

/**
 * 取得特定群組資訊
 */
router.get(
  "/guilds/:guildId",
  (req, res, next) => verifyLineGroupId(req.params.guildId, res, next),
  verifyToken,
  GuildController.api.getGuildSummary
);

/**
 * 取得群組三刀簽到表
 */
router.get(
  "/guilds/:guildId/battle-signs/months/:month",
  (req, res, next) => verifyLineGroupId(req.params.guildId, res, next),
  GuildBattleController.api.showSigninList
);

/**
 * 群組戰隊設定資訊
 */
router.get(
  "/guilds/:guildId/battle-config",
  (req, res, next) => verifyLineGroupId(req.params.guildId, res, next),
  verifyToken,
  GuildBattleController.api.getGuildBattleConfig
);

router.put(
  "/guilds/:guildId/battle-config",
  (req, res, next) => verifyLineGroupId(req.params.guildId, res, next),
  verifyToken,
  GuildBattleController.api.updateGuildBattleConfig
);

router.get("/characters/images", PrincessCharacterController.api.getCharacterImages);

router.get("/chat-levels/rankings", ChatLevelController.api.queryRank);

router.get("/announcements/:page", AnnounceController.api.queryData);

/**
 * 小遊戲 - 世界王
 */
// 新增世界王傷害特色訊息
router.post(
  "/game/world-boss/feature-messages",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(3),
  WorldBossController.api.createAttackMessage
);
// 取得世界王傷害特色訊息
router.get(
  "/game/world-boss/feature-messages",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(1),
  WorldBossController.api.listAttackMessage
);
// 取得世界王傷害特色訊息 - 單筆
router.get(
  "/game/world-boss/feature-messages/:id",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(1),
  WorldBossController.api.getAttackMessage
);
// 編輯世界王傷害特色訊息
router.put(
  "/game/world-boss/feature-messages/:id",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(3),
  WorldBossController.api.updateAttackMessage
);
// 刪除世界王傷害特色訊息
router.delete(
  "/game/world-boss/feature-messages/:id",
  verifyToken,
  verifyAdmin,
  verifyPrivilege(3),
  WorldBossController.api.deleteAttackMessage
);

const JankenController = require("../controller/application/JankenController");

router.get("/janken/rankings", JankenController.api.rankings);
router.get("/janken/recent-matches", JankenController.api.recentMatches);

const RaceRouter = require("./race");
router.use("/race", RaceRouter);

const AchievementController = require("../controller/application/AchievementController");

router.get("/achievements", AchievementController.api.getAll);
router.get("/achievements/rankings", AchievementController.api.getRanking);
router.get("/achievements/user/:userId", AchievementController.api.getUserAchievements);
router.get("/achievements/stats", AchievementController.api.getStats);
router.get("/titles/user/:userId", AchievementController.api.getUserTitles);

/**
 * 訂閱者自動行為偏好 / 歷史
 */
const AutoPreferenceController = require("../controller/application/AutoPreferenceController");
router.get("/auto-preference", verifyToken, AutoPreferenceController.api.getPreference);
router.put("/auto-preference", verifyToken, AutoPreferenceController.api.setPreference);
router.get("/auto-history", verifyToken, AutoPreferenceController.api.getHistory);

/**
 * 轉生系統
 */
const PrestigeController = require("../controller/application/PrestigeController");
router.get("/prestige/status", verifyToken, PrestigeController.api.status);
router.post("/prestige/trial/start", verifyToken, PrestigeController.api.startTrial);
router.post("/prestige/trial/forfeit", verifyToken, PrestigeController.api.forfeitTrial);
router.post("/prestige/prestige", verifyToken, PrestigeController.api.prestige);

router.all("*", (_, res) => {
  res.status(404).json({ message: "invalid api url." });
});

module.exports = router;
