const CronJob = require("cron").CronJob;
const mysql = require("../lib/mysql");
const notify = require("../lib/notify");
// 設定每日早中晚時段的攻擊次數
const attackConfig = {
  morning: {
    title: "早上",
    max: 3,
    startHour: 4,
    endHour: 12,
  },
  afternoon: {
    title: "下午",
    max: 3,
    startHour: 12,
    endHour: 20,
  },
  night: {
    title: "晚上",
    max: 4,
    startHour: 20,
    endHour: 24,
  },
  midnight: {
    title: "午夜",
    max: 1,
    startHour: 0,
    endHour: 4,
  },
};

async function progressNotify() {
  try {
    const event = await getHoldingEvent();
    if (!event) {
      return;
    }

    const [result] = await mysql
      .sum("damage as total_damage")
      .from("world_boss_event_log")
      .where("world_boss_event_id", event.id);

    const { hp, name } = event;
    const damage = parseInt(result.total_damage) || 0;
    const remainHp = hp - damage;
    const remainHpPercent = remainHp > 0 ? (remainHp / hp) * 100 : 0;
    const message = `${name} 剩餘血量：${remainHpPercent.toFixed(2)}%`;

    const notifyList = await getNotifyList();
    const sentPromise = Promise.all(
      notifyList.map(async item => {
        const { token } = item;
        await notify.push({ token, message });
      })
    );

    await sentPromise;
  } catch (e) {
    console.log(e);
  }
}

async function battlePreparation(period) {
  const event = await getHoldingEvent();
  if (!event || !period) {
    return;
  }

  if (!Object.keys(attackConfig).includes(period)) {
    return;
  }

  const config = attackConfig[period];

  const notifyList = await getNotifyList();
  const sentPromise = Promise.all(
    notifyList.map(async item => {
      const { token } = item;
      // 進行準備出刀通知
      const message = `剩餘 10 分鐘進入 ${config.title} 時段\n將會重置出刀次數\n可出刀數： ${config.max} 次`;
      await notify.push({ token, message });
    })
  );

  await sentPromise;
}

async function regularRemind() {
  const tipList = await getTipList();
  // 隨機抽取一個小提示訊息
  const tipData = tipList[Math.floor(Math.random() * tipList.length)];
  const tipMessage = tipData.message;

  // 取得通知列表
  const notifyList = await getNotifyList();
  const sentPromise = Promise.all(
    notifyList.map(async item => {
      const { token } = item;
      await notify.push({ token, message: tipMessage });
    })
  );

  await sentPromise;
}

async function getHoldingEvent() {
  const now = new Date();
  return await mysql
    .select(["world_boss_event.id", "world_boss_id", "hp", "name"])
    .from("world_boss_event")
    .join("world_boss", "world_boss.id", "world_boss_event.world_boss_id")
    .where("start_time", "<=", now)
    .where("end_time", ">=", now)
    .first();
}

async function getNotifyList() {
  return await mysql.select({ token: "notify_token" }).from("world_boss_notify");
}

async function getTipList() {
  return await mysql.select(["message"]).from("world_boss_tips");
}

// 凌晨 3:50 執行出刀通知
new CronJob(
  "0 50 3 * * *",
  async () => {
    await battlePreparation("morning");
  },
  null,
  true,
  "Asia/Taipei"
);

// 早上 11:50 執行出刀通知
new CronJob(
  "0 50 11 * * *",
  async () => {
    await battlePreparation("afternoon");
  },
  null,
  true,
  "Asia/Taipei"
);

// 下午 19:50 執行出刀通知
new CronJob(
  "0 50 19 * * *",
  async () => {
    await battlePreparation("night");
  },
  null,
  true,
  "Asia/Taipei"
);

// 晚上 23:50 執行出刀通知
new CronJob(
  "0 50 23 * * *",
  async () => {
    await battlePreparation("midnight");
  },
  null,
  true,
  "Asia/Taipei"
);

// 每十分鐘執行血量剩餘通知
new CronJob(
  "0 */10 0-1,6-23 * * *",
  async () => {
    await progressNotify();
  },
  null,
  true,
  "Asia/Taipei"
);

// 每十分鐘執行提示訊息，但不包含 1:00~5:00 時段
new CronJob(
  "0 */10 0-1,6-23 * * *",
  async () => {
    await regularRemind();
  },
  null,
  true,
  "Asia/Taipei"
);
