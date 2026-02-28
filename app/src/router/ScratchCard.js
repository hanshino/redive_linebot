const { api } = require("../controller/application/ScratchCardController");
const { verifyAdmin, verifyToken } = require("../middleware/validation");
const createRouter = require("express").Router;
const router = createRouter();

router.get("/", api.list);

router.get("/my-cards", verifyToken, api.showMyCards);
router.get("/my-cards/count", verifyToken, api.myCardsCount);
router.put("/exchange", verifyToken, api.exchange);

router.get("/:id", api.show);
router.post("/:id/purchase", verifyToken, api.purchase);

router.post("/generate", verifyToken, verifyAdmin, api.generateCards);

module.exports = router;
