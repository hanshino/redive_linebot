const path = require("path");
const { spawnSync } = require("child_process");

const appRoot = path.resolve(__dirname, "../..");

function runCli(script) {
  return spawnSync(process.execPath, ["-e", script], {
    cwd: appRoot,
    encoding: "utf8",
  });
}

describe("WorldBossSeasonSettle CLI", () => {
  test("logs a rejected settlement and exits nonzero", () => {
    const result = runCli(`
      const cron = require("./bin/WorldBossSeasonSettle");
      cron.runCli(async () => { throw new Error("forced cron failure"); });
    `);

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("forced cron failure");
  });

  test("exits zero after a successful settlement", () => {
    const result = runCli(`
      const cron = require("./bin/WorldBossSeasonSettle");
      cron.runCli(async () => []);
    `);

    expect(result.status).toBe(0);
  });
});
