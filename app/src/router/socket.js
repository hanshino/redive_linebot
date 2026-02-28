const { io } = require("../util/connection");
const { socketSetProfile, socketVerifyAdmin } = require("../middleware/validation");
var onlineCounter = 0;

io.of("/admin/messages")
  .use(socketSetProfile)
  .use(socketVerifyAdmin)
  .on("connection", () => {
    console.log("進入管理頁面");
  });

io.on("connection", socket => {
  onlineCounter++;
  console.log(`線上人數：${onlineCounter}`);

  socket.on("disconnect", () => {
    onlineCounter--;
    console.log(`線上人數：${onlineCounter}`);
  });
});
