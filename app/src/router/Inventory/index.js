const { verifyToken } = require("../../middleware/validation");
const { all } = require("../../handler/Inventory");
const createRouter = require("express").Router;
const router = createRouter();

router.get("/Inventory", verifyToken, all);

exports.router = router;
