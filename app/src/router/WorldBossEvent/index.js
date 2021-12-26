const createRouter = require("express").Router;
const adminWorldBossEventHandler = require("../../handler/WorldBossEvent").admin;
const AdminRouter = createRouter();

AdminRouter.get("/WorldBossEvent", adminWorldBossEventHandler.all);
AdminRouter.get("/WorldBossEvent/:id", adminWorldBossEventHandler.find);
AdminRouter.post("/WorldBossEvent", adminWorldBossEventHandler.create);
AdminRouter.put("/WorldBossEvent/:id", adminWorldBossEventHandler.update);
AdminRouter.delete("/WorldBossEvent/:id", adminWorldBossEventHandler.destroy);

exports.admin = AdminRouter;
