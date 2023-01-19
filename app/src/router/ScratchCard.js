const { api } = require("../controller/application/ScratchCardController");
const { verifyAdmin, verifyToken } = require("../middleware/validation");
const createRouter = require("express").Router;
const router = createRouter();

router.get("/", api.list);

router.get("/MyCards", verifyToken, api.showMyCards);
router.get("/MyCards/Count", verifyToken, api.myCardsCount);
router.put("/Exchange", verifyToken, api.exchange);

router.get("/:id", api.show);
router.post("/:id/Purchase", verifyToken, api.purchase);

router.post("/generate", verifyToken, verifyAdmin, api.generateCards);

module.exports = router;
