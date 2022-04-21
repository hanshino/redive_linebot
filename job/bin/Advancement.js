const CronJob = require("cron").CronJob;
const controller = require("../controller/AdvancementController");

module.exports = controller;

// 只在正式環境馬上執行
const immediateStart = process.env.NODE_ENV === "production";

// 每天凌晨 3:00 進行成就稱號派送
new CronJob(
  "0 0 3 * * *",
  async () => {
    await controller.delivery();
  },
  null,
  immediateStart,
  "Asia/Taipei"
);
