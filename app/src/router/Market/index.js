const { show, transaction, cancel } = require("../../handler/Market");
const { verifyToken } = require("../../middleware/validation");
const createRouter = require("express").Router;
const router = createRouter();

router.get("/Market/:id", verifyToken, show);
router.post("/Market/:id/Transaction", verifyToken, transaction);
router.delete("/Market/:id/Transaction", verifyToken, cancel);

exports.router = router;
