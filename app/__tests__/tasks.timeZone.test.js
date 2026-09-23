// U9(a)/KTD14：scheduler wiring only。cron/Task/bin 全 mock，不啟動真 worker、DB 或 Redis。
process.env.NODE_ENV = "production";
process.env.SUPPRESS_NO_CONFIG_WARNING = "true";

jest.mock("../src/model/application/Task", () => ({
  init: jest.fn(),
  write: jest.fn().mockResolvedValue(undefined),
}));
const fromMock = jest.fn(() => ({ start: jest.fn(), stop: jest.fn() }));
jest.mock("cron", () => ({ CronJob: { from: fromMock } }));
jest.mock("../bin/AutoJankenMatchmaking", () => jest.fn().mockResolvedValue({ claimed: true }));
jest.mock("../bin/JankenAutoMatchOutboxDrainer", () =>
  jest.fn().mockResolvedValue({ processed: 0, failed: 0 })
);
jest.mock("../bin/DailyCleanup", () => jest.fn().mockResolvedValue(undefined));

const Task = require("../src/model/application/Task");
const AutoJankenMatchmaking = require("../bin/AutoJankenMatchmaking");
const JankenAutoMatchOutboxDrainer = require("../bin/JankenAutoMatchOutboxDrainer");
const DailyCleanup = require("../bin/DailyCleanup");

function loadScheduler() {
  fromMock.mockClear();
  let config;
  jest.isolateModules(() => {
    require("../tasks");
    config = require("../config/crontab.config");
  });
  return config.map((entry, index) => ({ entry, options: fromMock.mock.calls[index][0] }));
}

describe("tasks.js timeZone + disabled U9 wiring", () => {
  let registrations;

  beforeAll(() => {
    registrations = loadScheduler();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("舊 jobs omitted enabled/timeZone 保持 start=true、原 immediate/cronTime 不變", () => {
    const oldJobs = registrations.filter(
      ({ entry }) =>
        !["Auto Janken Matchmaking", "Janken Auto Match Outbox Drainer"].includes(entry.name)
    );
    expect(oldJobs.length).toBeGreaterThan(0);
    for (const { entry, options } of oldJobs) {
      expect(entry.enabled).toBeUndefined();
      expect(entry.timeZone).toBeUndefined();
      expect(options).toMatchObject({
        cronTime: entry.period.join(" "),
        start: true,
        runOnInit: Boolean(entry.immediate),
      });
      expect(options).not.toHaveProperty("timeZone");
    }
    const dailyQuest = oldJobs.find(({ entry }) => entry.name === "Daily Quest Process");
    expect(dailyQuest.entry).toMatchObject({
      period: ["0", "*", "*", "*", "*", "*"],
      immediate: true,
    });
  });

  test("每日配對預設 disabled、21:00 Asia/Taipei、沒有 immediate", async () => {
    const job = registrations.find(({ entry }) => entry.name === "Auto Janken Matchmaking");
    expect(job.entry).toMatchObject({
      enabled: false,
      period: ["0", "0", "21", "*", "*", "*"],
      immediate: false,
      timeZone: "Asia/Taipei",
      require_path: "./bin/AutoJankenMatchmaking",
    });
    expect(job.options).toMatchObject({
      cronTime: "0 0 21 * * *",
      start: true,
      runOnInit: false,
      timeZone: "Asia/Taipei",
    });

    await job.options.onTick();
    expect(AutoJankenMatchmaking).not.toHaveBeenCalled();
    expect(Task.write).not.toHaveBeenCalled();
  });

  test("outbox drainer 已接線但預設 disabled，不會 require-time 或 tick 消費", async () => {
    const job = registrations.find(
      ({ entry }) => entry.name === "Janken Auto Match Outbox Drainer"
    );
    expect(job.entry).toMatchObject({
      enabled: false,
      immediate: false,
      timeZone: "Asia/Taipei",
      require_path: "./bin/JankenAutoMatchOutboxDrainer",
    });
    expect(job.options.runOnInit).toBe(false);

    await job.options.onTick();
    expect(JankenAutoMatchOutboxDrainer).not.toHaveBeenCalled();
    expect(Task.write).not.toHaveBeenCalled();
  });

  test("明確 enabled=true 才會執行新 job；測試後 source config 維持 false", async () => {
    const job = registrations.find(({ entry }) => entry.name === "Auto Janken Matchmaking");
    try {
      job.entry.enabled = true;
      await job.options.onTick();
      expect(AutoJankenMatchmaking).toHaveBeenCalledTimes(1);
      expect(Task.write).toHaveBeenCalledTimes(1);
    } finally {
      job.entry.enabled = false;
    }
    expect(job.entry.enabled).toBe(false);
  });

  test("舊 job omitted enabled 仍可執行並寫 Task", async () => {
    const job = registrations.find(({ entry }) => entry.name === "Daily Cleanup");

    await job.options.onTick();

    expect(DailyCleanup).toHaveBeenCalledTimes(1);
    expect(Task.write).toHaveBeenCalledWith(
      { name: job.entry.name, description: job.entry.description },
      expect.any(Date)
    );
  });
});
