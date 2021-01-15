const CronJob = require("cron").CronJob;
const script = require("./bin");

let monthJob = new CronJob("0 0 0 1 * *", script.Group.resetRecords);
let dailyJob = new CronJob("0 0 0 * * *", daily);
let eventRunning = false;
let eventJob = new CronJob("* * * * * *", async () => {
  if (eventRunning) return;
  eventRunning = true;
  await script.Event.eventDequeue();
  eventRunning = false;
});
let updateRunning = false;
let updateRecordJob = new CronJob("*/5 * * * * *", async () => {
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

dailyJob.start();
eventJob.start();
monthJob.start();
updateRecordJob.start();
//spiderJob.start();
//provideNotifyJob.start();
//consumeNotifyJob.start();

async function daily() {
  await Promise.all([
    script.CustomerOrder.removeDeleted(),
    script.CustomerOrder.markUseless(),
    script.Group.clearClosed(),
    script.Group.clearLeftMembers(),
  ]);
}
