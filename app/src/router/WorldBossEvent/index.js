const createRouter = require("express").Router;
const adminWorldBossEventHandler = require("../../handler/WorldBossEvent").admin;
const AdminRouter = createRouter();
const router = createRouter();

AdminRouter.get("/WorldBossEvent", adminWorldBossEventHandler.all);

router.use("/Admin", AdminRouter);

module.exports = router;
