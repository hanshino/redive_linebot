const DailyQuestController = require("../controller/DailyQuestController");
const CronJob = require("cron").CronJob;

// 每分鐘執行一次
new CronJob(
  "0 * * * * *",
  async () => {
    await DailyQuestController.run();
  },
  null,
  true,
  "Asia/Taipei"
);
