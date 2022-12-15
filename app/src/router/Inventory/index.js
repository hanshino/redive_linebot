const { verifyToken } = require("../../middleware/validation");
const { all, getPool } = require("../../handler/Inventory");
const createRouter = require("express").Router;
const router = createRouter();

// 取得所有物品
router.get("/Inventory", verifyToken, all);

// 取得角色池
router.get("/Inventory/Pool", getPool);

exports.router = router;
