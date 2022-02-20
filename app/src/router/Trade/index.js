const { create } = require("../../handler/Trade");
const { verifyToken } = require("../../middleware/validation");
const createRouter = require("express").Router;
const router = createRouter();

router.post("/Trade", verifyToken, create);

exports.router = router;
