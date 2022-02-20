const { show } = require("../../handler/Market");
const { verifyToken } = require("../../middleware/validation");
const createRouter = require("express").Router;
const router = createRouter();

router.get("/Market/:id", verifyToken, show);

exports.router = router;
