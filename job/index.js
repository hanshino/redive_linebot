if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: "../.env" });
}

const CronJob = require("cron").CronJob;
const script = require("./bin");
require("./bin/WorldBoss");
require("./bin/Advancement");
require("./bin/EventCenter");
require("./bin/Tips");

let halfMinutesJob = new CronJob("*/20 * * * * *", script.Notify.consumePassiveNotify);
let weekJob = new CronJob("0 0 3 * * 3", week);
let monthJob = new CronJob("0 0 0 1 * *", script.Group.resetRecords);
let dailyJob = new CronJob("0 0 0 * * *", daily);
let eventRunning = false;
let eventJob = new CronJob("* * * * * *", async () => {
  if (eventRunning) return;
  eventRunning = true;
  try {
    await script.Event.eventDequeue();
  } catch (err) {
    console.error(err);
  }
  eventRunning = false;
});
let updateRunning = false;
let updateRecordJob = new CronJob("0 */5 * * * *", async () => {
  if (updateRunning) return;
  updateRunning = true;
  await script.Event.updateRecord();
  updateRunning = false;
});

let spiderRunning = false;
let spiderJob = new CronJob("0 1,6,11,16,21,26,31,36,41,46,51,56 * * * *", async () => {
  if (spiderRunning) return;
  await script.Spider.main();
});

let consumeNotifyJob = new CronJob("*/10 * * * * *", async () => {
  await script.Notify.consumeNotifyList();
});

let provideNotifyJob = new CronJob("5 * * * * *", async () => {
  await script.Notify.provideNotifyList();
});

let rankingJob = new CronJob("12 */10 * * * *", async () => {
  await script.ChatLevel.refreshRanking();
});

let isCleanUpRun = false;
let consumeCleanUpMembers = new CronJob("0 */15 * * * 3", async () => {
  if (isCleanUpRun) return;
  isCleanUpRun = true;
  await script.Group.consumeCleanUpMembers();
  isCleanUpRun = false;
});

weekJob.start();
dailyJob.start();
eventJob.start();
monthJob.start();
updateRecordJob.start();
provideNotifyJob.start();
consumeNotifyJob.start();
rankingJob.start();
halfMinutesJob.start();

if (process.env.NODE_ENV !== "development") {
  spiderJob.start();
  consumeCleanUpMembers.start();
}

async function daily() {
  await Promise.all([
    script.CustomerOrder.removeDeleted(),
    script.CustomerOrder.markUseless(),
    script.Group.clearClosed(),
    script.Group.clearLeftMembers(),
  ]);
}

async function week() {
  await Promise.all([script.Group.provideCleanUpMembers()]);
}
