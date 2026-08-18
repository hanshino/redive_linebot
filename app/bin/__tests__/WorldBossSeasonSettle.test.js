const path = require("path");
const { spawnSync } = require("child_process");

jest.mock("../../src/service/WorldBossSeasonService", () => ({
  settleExpiredSeasons: jest.fn(),
}));
jest.mock("../../src/util/Logger", () => ({
  DefaultLogger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const service = require("../../src/service/WorldBossSeasonService");
const { DefaultLogger } = require("../../src/util/Logger");
const cron = require("../WorldBossSeasonSettle");
const crontab = require("../../config/crontab.config");
const appRoot = path.resolve(__dirname, "../..");

function runCli(script) {
  return spawnSync(process.execPath, ["-e", script], {
    cwd: appRoot,
    encoding: "utf8",
  });
}

describe("WorldBossSeasonSettle CLI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("settles expired seasons once, returns the result, and logs a nonempty settlement", async () => {
    const results = [{ seasonId: 12, settled: true }];
    service.settleExpiredSeasons.mockResolvedValue(results);

    await expect(cron.main()).resolves.toBe(results);

    expect(service.settleExpiredSeasons).toHaveBeenCalledTimes(1);
    expect(DefaultLogger.info).toHaveBeenCalledWith(
      `World boss season settle: ${JSON.stringify(results)}`
    );
  });

  test("does not log when no expired season was settled", async () => {
    service.settleExpiredSeasons.mockResolvedValue([]);

    await expect(cron.main()).resolves.toEqual([]);

    expect(service.settleExpiredSeasons).toHaveBeenCalledTimes(1);
    expect(DefaultLogger.info).not.toHaveBeenCalled();
  });

  test("registers exactly one minute-ten settlement cron job", () => {
    const jobs = crontab.filter(entry => entry.name === "World Boss Season Settle");

    expect(jobs).toEqual([
      {
        name: "World Boss Season Settle",
        description: "settle expired active world boss seasons",
        period: ["0", "10", "*", "*", "*", "*"],
        immediate: false,
        require_path: "./bin/WorldBossSeasonSettle",
      },
    ]);
  });

  test("logs a rejected settlement and exits nonzero", () => {
    const result = runCli(`
      const cron = require("./bin/WorldBossSeasonSettle");
      cron.runCli(async () => { throw new Error("forced cron failure"); });
    `);

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("forced cron failure");
  });

  test("loads the root environment before importing the settlement service", () => {
    const result = runCli(`
      delete process.env.DB_USER;
      delete process.env.DB_USER_PASSWORD;
      const servicePath = require.resolve("./src/service/WorldBossSeasonService");
      require.cache[servicePath] = {
        id: servicePath,
        filename: servicePath,
        loaded: true,
        exports: { settleExpiredSeasons: async () => [] },
        children: [],
        paths: [],
      };
      require("./bin/WorldBossSeasonSettle");
      process.stdout.write(JSON.stringify({
        userLoaded: Boolean(process.env.DB_USER),
        passwordLoaded: Boolean(process.env.DB_USER_PASSWORD),
      }));
    `);

    expect(result.status).toBe(0);
    const output = result.stdout.trim().split("\n").at(-1);
    expect(JSON.parse(output)).toEqual({ userLoaded: true, passwordLoaded: true });
  });

  test("exits zero after a successful settlement", () => {
    const result = runCli(`
      const cron = require("./bin/WorldBossSeasonSettle");
      cron.runCli(async () => []);
    `);

    expect(result.status).toBe(0);
  });
});
