const { api } = require("../controller/application/ScratchCardController");
const { verifyAdmin, verifyToken } = require("../middleware/validation");
const createRouter = require("express").Router;
const router = createRouter();

router.get("/", api.list);

router.post("/generate", verifyToken, verifyAdmin, api.generateCards);

module.exports = router;
