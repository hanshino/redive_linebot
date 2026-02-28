const createRouter = require("express").Router;
const AdminRouter = createRouter();
const PlayerRouter = createRouter();
const { admin: adminHandler, player: playerHandler } = require("../../handler/Equipment");

AdminRouter.get("/equipment", adminHandler.getAllEquipment);
AdminRouter.get("/equipment/:id", adminHandler.getEquipmentById);
AdminRouter.post("/equipment", adminHandler.storeEquipment);
AdminRouter.put("/equipment/:id", adminHandler.updateEquipment);
AdminRouter.delete("/equipment/:id", adminHandler.deleteEquipment);

PlayerRouter.get("/equipment/me", playerHandler.getMyEquipment);
PlayerRouter.get("/equipment/available", playerHandler.getAvailableEquipment);
PlayerRouter.post("/equipment/equip", playerHandler.equip);
PlayerRouter.post("/equipment/unequip", playerHandler.unequip);

exports.admin = AdminRouter;
exports.player = PlayerRouter;
