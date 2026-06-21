const PlayerRouter = require("express").Router();
const { player: playerHandler } = require("../../handler/WorldBoss");

PlayerRouter.get("/world-boss/snapshot", playerHandler.getSnapshot);
PlayerRouter.get("/world-boss/me", playerHandler.getMe);
PlayerRouter.post("/world-boss/attack", playerHandler.attack);
PlayerRouter.post("/world-boss/block", playerHandler.block);
PlayerRouter.post("/world-boss/revive", playerHandler.revive);
PlayerRouter.post("/world-boss/shield", playerHandler.shield);
PlayerRouter.post("/world-boss/role", playerHandler.role);
PlayerRouter.post("/world-boss/enhance", playerHandler.enhance);
PlayerRouter.get("/world-boss/report", playerHandler.getReport);

exports.player = PlayerRouter;
