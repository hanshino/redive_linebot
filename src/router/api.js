const express = require("express");
const router = express.Router();
const cors = require("cors");
const GroupRecordController = require("../controller/application/GroupRecord");
const CustomerOrderController = require("../controller/application/CustomerOrder");
const GroupConfigController = require("../controller/application/GroupConfig");
const GroupConfig = require("../../doc/GroupConfig.json");
const { verifyToken } = require("../middleware/validation");

router.use(cors());

router.get("/Group/:groupId/Speak/Rank", GroupRecordController.getRankDatas);
router.get("/Source/:sourceId/Customer/Orders", CustomerOrderController.fetchCustomerOrders);
router.put("/Source/:sourceId/Customer/Orders", verifyToken, CustomerOrderController.updateOrder);
router.put(
  "/Group/:groupId/Name/:name/:status",
  verifyToken,
  GroupConfigController.api.switchConfig
);
router.get("/Group/:groupId/Config", GroupConfigController.api.fetchConfig);
router.all("/GroupConfig", (req, res) => res.json(GroupConfig));

router.all("*", (req, res) => {
  res.status(404).json({ message: "invalid api url." });
});

module.exports = router;
