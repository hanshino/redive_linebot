const { verifyToken } = require("../../middleware/validation");
const { all, getPool, totalGodStone } = require("../../handler/Inventory");
const createRouter = require("express").Router;
const router = createRouter();

// 取得所有物品
router.get("/inventory", verifyToken, all);

// 取得角色池
router.get("/inventory/pool", getPool);

router.get("/inventory/total-god-stone", verifyToken, totalGodStone);

exports.router = router;
