// Keep client resolution outside the recurring drain tick.

describe("bin/BroadcastQueueDrainer ioredis leak guard", () => {
  let mockBot;
  let main;

  beforeAll(() => {
    jest.resetModules();
    mockBot = require("../../src/lib/bot");
    const mockRedis = require("../../src/util/redis");
    mockRedis.scanIterator = jest.fn(() => (async function* () {})());
    main = require("../BroadcastQueueDrainer");
  });

  it("requires getClient exactly once at module load", () => {
    expect(mockBot.getClient).toHaveBeenCalledTimes(1);
    expect(mockBot.getClient).toHaveBeenCalledWith("line");
  });

  it("never reinvokes getClient when main runs repeatedly", async () => {
    for (let i = 0; i < 10; i++) {
      await main();
    }
    expect(mockBot.getClient).toHaveBeenCalledTimes(1);
  });
});
