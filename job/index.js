const CronJob = require("cron").CronJob;
const script = require("./script/index");

let dailyJob = new CronJob("0 0 0 * * *", daily);
let nonStopJob = new CronJob("0 0 * * * *", script.heartbeat);

dailyJob.start();
nonStopJob.start();

async function daily() {
  await Promise.all([
    script.CustomerOrder.removeDeleted(),
    script.CustomerOrder.markUseless(),
    script.Group.clearClosed(),
  ]);
}
