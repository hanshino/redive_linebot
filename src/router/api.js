const express = require("express");
const router = express.Router();
const GroupRecordController = require("../controller/application/GroupRecord");
const CustomerOrderController = require("../controller/application/CustomerOrder");
const GroupConfigController = require("../controller/application/GroupConfig");
const GlobalOrdersController = require("../controller/application/GlobalOrders");
const GroupConfig = require("../../doc/GroupConfig.json");
const { verifyToken, verifyAdmin } = require("../middleware/validation");
const gacha = require("../controller/princess/gacha");

router.get("/Group/:groupId/Speak/Rank", GroupRecordController.getRankDatas);
router.get("/Source/:sourceId/Customer/Orders", CustomerOrderController.fetchCustomerOrders);
router.put("/Source/:sourceId/Customer/Orders", verifyToken, CustomerOrderController.updateOrder);
router.put(
  "/Group/:groupId/Name/:name/:status",
  verifyToken,
  GroupConfigController.api.switchConfig
);
router.get("/Group/:groupId/Config", GroupConfigController.api.fetchConfig);
router.get("/GroupConfig", (req, res) => res.json(GroupConfig));
router.get("/Admin/GachaPool/Data", gacha.api.showGachaPool);
router.put("/Admin/GachaPool/Data", verifyToken, verifyAdmin, gacha.api.updateCharacter);
router.post("/Admin/GachaPool/Data", verifyToken, verifyAdmin, gacha.api.insertCharacter);
router.delete("/Admin/GachaPool/Data/:id", verifyToken, verifyAdmin, gacha.api.deleteCharacter);
router.get("/Admin/GlobalOrders/Data", GlobalOrdersController.api.showGlobalOrders);
router.post("/Admin/GlobalOrders/Data", GlobalOrdersController.api.insertGlobalOrders);
router.put("/Admin/GlobalOrders/Data", GlobalOrdersController.api.updateGlobalOrders);
router.delete("/Admin/GlobalOrders/Data/:orderKey", GlobalOrdersController.api.deleteGlobalOrders);

router.all("*", (req, res) => {
  res.status(404).json({ message: "invalid api url." });
});

module.exports = router;
