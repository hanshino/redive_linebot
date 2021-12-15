const createRouter = require("express").Router;
const AdminRouter = createRouter();
const router = createRouter();
const { admin: adminHandler } = require("../../handler/WorldBoss");

AdminRouter.get("/WorldBoss", adminHandler.getAllWorldBoss);
AdminRouter.post("/WorldBoss", adminHandler.storeWorldBoss);
AdminRouter.put("/WorldBoss/:id", adminHandler.updateWorldBoss);
AdminRouter.delete("/WorldBoss/:id", adminHandler.deleteWorldBoss);

router.use("/Admin", AdminRouter);

module.exports = router;
