const createRouter = require("express").Router;
const adminWorldBossEventHandler = require("../../handler/WorldBossEvent").admin;
const AdminRouter = createRouter();

AdminRouter.get("/world-boss-events", adminWorldBossEventHandler.all);
AdminRouter.get("/world-boss-events/:id", adminWorldBossEventHandler.find);
AdminRouter.post("/world-boss-events", adminWorldBossEventHandler.create);
AdminRouter.put("/world-boss-events/:id", adminWorldBossEventHandler.update);
AdminRouter.delete("/world-boss-events/:id", adminWorldBossEventHandler.destroy);

exports.admin = AdminRouter;
