const createRouter = require("express").Router;
const AdminRouter = createRouter();
const PlayerRouter = createRouter();
const { admin: adminHandler, player: playerHandler } = require("../../handler/Equipment");

AdminRouter.get("/Equipment", adminHandler.getAllEquipment);
AdminRouter.get("/Equipment/:id", adminHandler.getEquipmentById);
AdminRouter.post("/Equipment", adminHandler.storeEquipment);
AdminRouter.put("/Equipment/:id", adminHandler.updateEquipment);
AdminRouter.delete("/Equipment/:id", adminHandler.deleteEquipment);

PlayerRouter.get("/Equipment/me", playerHandler.getMyEquipment);
PlayerRouter.get("/Equipment/available", playerHandler.getAvailableEquipment);
PlayerRouter.post("/Equipment/equip", playerHandler.equip);
PlayerRouter.post("/Equipment/unequip", playerHandler.unequip);

exports.admin = AdminRouter;
exports.player = PlayerRouter;
