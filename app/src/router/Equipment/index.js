const createRouter = require("express").Router;
const AdminRouter = createRouter();
const { admin: adminHandler } = require("../../handler/Equipment");

AdminRouter.get("/Equipment", adminHandler.getAllEquipment);
AdminRouter.get("/Equipment/:id", adminHandler.getEquipmentById);
AdminRouter.post("/Equipment", adminHandler.storeEquipment);
AdminRouter.put("/Equipment/:id", adminHandler.updateEquipment);
AdminRouter.delete("/Equipment/:id", adminHandler.deleteEquipment);

exports.admin = AdminRouter;
