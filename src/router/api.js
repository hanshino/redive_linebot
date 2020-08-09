const express = require("express");
const router = express.Router();
const cors = require("cors");
const GroupRecordController = require("../controller/application/GroupRecord");
const CustomerOrderController = require("../controller/application/CustomerOrder");

router.use(cors());

router.all("/Group/:groupId/Speak/Rank", GroupRecordController.getRankDatas);

router.get("/Source/:sourceId/Customer/Orders", CustomerOrderController.fetchCustomerOrders);

router.put("/Source/:sourceId/Customer/Orders", CustomerOrderController.updateOrder);

router.all("*", (req, res) => {
  res.status(404).json({ message: "invalid api url." });
});

module.exports = router;
