// Regression: bottender@1.5.5 `getClient()` is not memoized — each call opens
// a fresh ioredis session-store socket that's never quit() when the bot
// reference is GC'd. drainAll runs every 30s from cron, so calling getClient
// inside its body would leak a Redis connection per tick.

describe("bin/BroadcastQueueDrainer ioredis leak guard", () => {
  let mockBottender;
  let main;

  beforeAll(() => {
    jest.resetModules();
    mockBottender = require("bottender");
    const mockRedis = require("../../src/util/redis");
    mockRedis.scanIterator = jest.fn(() => (async function* () {})());
    main = require("../BroadcastQueueDrainer");
  });

  it("requires getClient exactly once at module load", () => {
    expect(mockBottender.getClient).toHaveBeenCalledTimes(1);
    expect(mockBottender.getClient).toHaveBeenCalledWith("line");
  });

  it("never reinvokes getClient when main runs repeatedly", async () => {
    for (let i = 0; i < 10; i++) {
      await main();
    }
    expect(mockBottender.getClient).toHaveBeenCalledTimes(1);
  });
});
