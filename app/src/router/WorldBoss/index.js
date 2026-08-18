const createRouter = require("express").Router;
const AdminRouter = createRouter();
const PublicRouter = createRouter();
const admin = require("../../handler/WorldBoss/admin");
const publicHandler = require("../../handler/WorldBoss/public");

AdminRouter.get("/world-bosses", admin.listBosses);
AdminRouter.post("/world-bosses", admin.createBoss);
AdminRouter.put("/world-bosses/:id", admin.updateBoss);
AdminRouter.delete("/world-bosses/:id", admin.deleteBoss);
AdminRouter.get("/world-boss-seasons", admin.listSeasons);
AdminRouter.post("/world-boss-seasons", admin.createSeason);
AdminRouter.put("/world-boss-seasons/:id", admin.updateSeason);
AdminRouter.delete("/world-boss-seasons/:id", admin.deleteSeason);
AdminRouter.post("/world-boss-seasons/:id/open", admin.openSeason);

PublicRouter.get("/status", publicHandler.status);
PublicRouter.get("/leaderboard", publicHandler.leaderboard);
PublicRouter.get("/me", publicHandler.me);
PublicRouter.post("/attack", publicHandler.attack);

exports.admin = AdminRouter;
exports.public = PublicRouter;
