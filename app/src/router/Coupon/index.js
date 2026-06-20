const createRouter = require("express").Router;
const AdminRouter = createRouter();
const { admin: adminHandler } = require("../../handler/Coupon");

AdminRouter.get("/coupons", adminHandler.list);
AdminRouter.get("/coupons/:id", adminHandler.detail);
AdminRouter.post("/coupons", adminHandler.store);
AdminRouter.put("/coupons/:id", adminHandler.update);
AdminRouter.delete("/coupons/:id", adminHandler.destroy);

exports.admin = AdminRouter;
