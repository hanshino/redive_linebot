const createRouter = require("express").Router;
const AdminRouter = createRouter();
const { admin: adminHandler } = require("../../handler/WorldBoss");

AdminRouter.get("/WorldBoss", adminHandler.getAllWorldBoss);
AdminRouter.get("/WorldBoss/:id", adminHandler.getWorldBossById);
AdminRouter.post("/WorldBoss", adminHandler.storeWorldBoss);
AdminRouter.put("/WorldBoss/:id", adminHandler.updateWorldBoss);
AdminRouter.delete("/WorldBoss/:id", adminHandler.deleteWorldBoss);

exports.admin = AdminRouter;
