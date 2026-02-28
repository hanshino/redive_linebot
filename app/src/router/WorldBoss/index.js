const createRouter = require("express").Router;
const AdminRouter = createRouter();
const { admin: adminHandler } = require("../../handler/WorldBoss");

AdminRouter.get("/world-bosses", adminHandler.getAllWorldBoss);
AdminRouter.get("/world-bosses/:id", adminHandler.getWorldBossById);
AdminRouter.post("/world-bosses", adminHandler.storeWorldBoss);
AdminRouter.put("/world-bosses/:id", adminHandler.updateWorldBoss);
AdminRouter.delete("/world-bosses/:id", adminHandler.deleteWorldBoss);

exports.admin = AdminRouter;
