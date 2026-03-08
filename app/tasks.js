const cron = require("cron").CronJob;
const crontab = require("./config/crontab.config");
const Task = require("./src/model/application/Task");
const moment = require("moment");

const jobs = [];

Task.init();

crontab.forEach(job => {
  const { name, description, period, immediate, require_path } = job;
  const task = new cron(
    period.join(" "),
    async () => {
      await require(require_path)();
      await Task.write({ name, description }, moment().toDate());
    },
    null,
    immediate
  );

  jobs.push({
    name,
    description,
    task,
  });
});
