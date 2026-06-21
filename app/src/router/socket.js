const { io } = require("../util/connection");
const { socketSetProfile, socketVerifyAdmin } = require("../middleware/validation");
const WorldBossEvent = require("../model/application/WorldBossEvent");
const WorldBossBroadcastService = require("../service/WorldBossBroadcastService");
var onlineCounter = 0;

io.of("/admin/messages")
  .use(socketSetProfile)
  .use(socketVerifyAdmin)
  .on("connection", () => {
    console.log("進入管理頁面");
  });

io.of("/world-boss")
  .use(socketSetProfile)
  .on("connection", async socket => {
    const event = await WorldBossEvent.getActive();
    if (!event) return;
    socket.join(WorldBossBroadcastService.roomName(event.id));
    const snapshot = await WorldBossBroadcastService.buildSnapshot(event.id);
    socket.emit("snapshot", snapshot);
  });

io.on("connection", socket => {
  onlineCounter++;
  console.log(`線上人數：${onlineCounter}`);

  socket.on("disconnect", () => {
    onlineCounter--;
    console.log(`線上人數：${onlineCounter}`);
  });
});
