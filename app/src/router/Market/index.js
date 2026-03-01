const { show, transaction, cancel } = require("../../handler/Market");
const { verifyToken } = require("../../middleware/validation");
const createRouter = require("express").Router;
const router = createRouter();

router.get("/market/:id", verifyToken, show);
router.post("/market/:id/transactions", verifyToken, transaction);
router.delete("/market/:id/transactions", verifyToken, cancel);

exports.router = router;
