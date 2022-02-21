const { show, transaction } = require("../../handler/Market");
const { verifyToken } = require("../../middleware/validation");
const createRouter = require("express").Router;
const router = createRouter();

router.get("/Market/:id", verifyToken, show);
router.post("/Market/:id/Transaction", verifyToken, transaction);

exports.router = router;
