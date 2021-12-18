const createRouter = require("express").Router;
const AdminRouter = createRouter();
const router = createRouter();
const { verifyToken, verifyAdmin } = require("../../middleware/validation");
const { admin: adminHandler } = require("../../handler/WorldBoss");

AdminRouter.get("/WorldBoss", adminHandler.getAllWorldBoss);
AdminRouter.get("/WorldBoss/:id", adminHandler.getWorldBossById);
AdminRouter.post("/WorldBoss", adminHandler.storeWorldBoss);
AdminRouter.put("/WorldBoss/:id", adminHandler.updateWorldBoss);
AdminRouter.delete("/WorldBoss/:id", adminHandler.deleteWorldBoss);

router.use("/Admin", verifyToken, verifyAdmin, AdminRouter);

module.exports = router;
