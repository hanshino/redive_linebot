const { create, all } = require("../../handler/Trade");
const { verifyToken } = require("../../middleware/validation");
const createRouter = require("express").Router;
const router = createRouter();

router.post("/trades", verifyToken, create);

// 提供商品方，可以查看自己的交易紀錄
router.get("/trades", verifyToken, all);

exports.router = router;
