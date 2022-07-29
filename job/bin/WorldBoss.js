const CronJob = require("cron").CronJob;
const mysql = require("../lib/mysql");
const notify = require("../lib/notify");

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

    if (remainHpPercent === 0) {
      return 0;
    }

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

async function regularRemind() {
  const event = await getHoldingEvent();
  if (!event) {
    return;
  }

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

// 只在正式環境馬上執行
const immediateStart = process.env.NODE_ENV === "production" || true;

// 每 兩小時 執行血量剩餘通知
new CronJob(
  "0 0 10,12,14,16,18,20,22 * * *",
  async () => {
    await progressNotify();
  },
  null,
  immediateStart,
  "Asia/Taipei"
);

// 每 兩小時 執行一次提示訊息
new CronJob(
  "0 5 11,13,15,17,19,21,23 * * *",
  async () => {
    await regularRemind();
  },
  null,
  immediateStart,
  "Asia/Taipei"
);
