// Regression test for 2026-03-08 bug (befa043) where positional-args wiring
// of CronJob routed `immediate` into the `start` slot, leaving every
// `immediate: false` cron job constructed but never ticking.
//
// The invariant below rejects that class of bug at the tasks.js layer:
// every crontab entry must be registered with `start: true`, regardless of
// whether it should also run on init.

const path = require("path");

jest.mock("../src/model/application/Task", () => ({
  init: jest.fn().mockResolvedValue(undefined),
  write: jest.fn().mockResolvedValue(undefined),
}));

const fromMock = jest.fn(() => ({ start: jest.fn(), stop: jest.fn() }));
jest.mock("cron", () => ({
  CronJob: { from: fromMock },
}));

describe("app/tasks.js cron registration", () => {
  let crontab;

  beforeAll(() => {
    process.env.NODE_ENV = "test";
    fromMock.mockClear();
    jest.isolateModules(() => {
      require("../tasks");
    });
    crontab = require("../config/crontab.config");
  });

  test("every configured job is registered exactly once", () => {
    expect(fromMock).toHaveBeenCalledTimes(crontab.length);
  });

  test("every job is constructed with start: true (would have caught befa043)", () => {
    for (const call of fromMock.mock.calls) {
      const options = call[0];
      expect(options).toEqual(
        expect.objectContaining({
          start: true,
          cronTime: expect.any(String),
          onTick: expect.any(Function),
        })
      );
    }
  });

  test("runOnInit mirrors the config's `immediate` flag", () => {
    const calls = fromMock.mock.calls.map(c => c[0]);
    crontab.forEach((entry, idx) => {
      expect(calls[idx].runOnInit).toBe(Boolean(entry.immediate));
      expect(calls[idx].cronTime).toBe(entry.period.join(" "));
    });
  });

  test("every crontab entry points at a resolvable bin script", () => {
    for (const entry of crontab) {
      const resolved = path.resolve(__dirname, "..", entry.require_path);
      expect(() => require.resolve(resolved)).not.toThrow();
    }
  });
});
