const mysql = require("../lib/mysql");
const { sample } = require("lodash");
const notify = require("../lib/notify");
const CronJob = require("cron").CronJob;

async function getNotifyList() {
  return await mysql.select({ token: "notify_token" }).from("world_boss_notify");
}

async function pickTip() {
  const list = await mysql.select(["message"]).from("tips_message");
  return sample(list);
}

async function tipsNotify() {
  const tip = await pickTip();

  if (!tip) {
    return;
  }

  // 取得通知列表
  const notifyList = await getNotifyList();
  const sentPromise = Promise.all(
    notifyList.map(async item => {
      const { token } = item;
      await notify.push({ token, message: tip.message });
    })
  );

  await sentPromise;
}

// 每30分鐘執行提示訊息，但不包含 1:00~5:00 時段
new CronJob(
  "0 20,50 11,13,15,17,19,21,23 * * *",
  async () => {
    await tipsNotify();
  },
  null,
  true,
  "Asia/Taipei"
);
