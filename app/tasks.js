const { CronJob } = require("cron");
const crontab = require("./config/crontab.config");
const Task = require("./src/model/application/Task");
const moment = require("moment");
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: require("path").resolve(__dirname, "../.env"),
  });
}

const jobs = [];

Task.init();

// `immediate` in crontab.config maps to cron's `runOnInit` (fire once on
// startup in addition to the schedule). `start: true` must always be set —
// without it the job is constructed but never ticks. A previous positional-
// args wiring (befa043) silently misrouted `immediate` into the `start`
// slot and left every `immediate: false` job dormant for weeks.
crontab.forEach(job => {
  const { name, description, period, immediate, require_path } = job;
  const task = CronJob.from({
    cronTime: period.join(" "),
    onTick: async () => {
      await require(require_path)();
      await Task.write({ name, description }, moment().toDate());
    },
    start: true,
    runOnInit: Boolean(immediate),
  });

  jobs.push({
    name,
    description,
    task,
  });
});
