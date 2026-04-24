// jest.config disables babel transform — jest.mock must precede requires.
// See feedback_jest_mock_hoisting.md
jest.mock("../../src/util/broadcastQueue", () => ({
  drain: jest.fn().mockResolvedValue({ drained: 0 }),
}));
jest.mock("../../src/util/replyTokenQueue", () => ({
  saveToken: jest.fn(),
  pullFreshToken: jest.fn(),
}));

const redis = require("../../src/util/redis");
const broadcastQueue = require("../../src/util/broadcastQueue");
const main = require("../../bin/BroadcastQueueDrainer");

function makeAsyncIterator(values) {
  return (async function* () {
    for (const v of values) yield v;
  })();
}

describe("BroadcastQueueDrainer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("drains every matching BROADCAST_QUEUE_* key", async () => {
    redis.scanIterator.mockReturnValueOnce(
      makeAsyncIterator(["BROADCAST_QUEUE_Ggrp1", "BROADCAST_QUEUE_Rrm1"])
    );

    await main();

    expect(broadcastQueue.drain).toHaveBeenCalledTimes(2);
    expect(broadcastQueue.drain).toHaveBeenCalledWith("Ggrp1", expect.any(Object));
    expect(broadcastQueue.drain).toHaveBeenCalledWith("Rrm1", expect.any(Object));
  });

  it("continues iteration when a single drain rejects", async () => {
    redis.scanIterator.mockReturnValueOnce(
      makeAsyncIterator(["BROADCAST_QUEUE_Gbad", "BROADCAST_QUEUE_Ggood"])
    );
    broadcastQueue.drain
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValueOnce({ drained: 1 });

    await expect(main()).resolves.toBeUndefined();
    expect(broadcastQueue.drain).toHaveBeenCalledTimes(2);
  });

  it("passes MATCH/COUNT to scanIterator", async () => {
    redis.scanIterator.mockReturnValueOnce(makeAsyncIterator([]));
    await main();
    expect(redis.scanIterator).toHaveBeenCalledWith(
      expect.objectContaining({ MATCH: "BROADCAST_QUEUE_*" })
    );
  });

  it("swallows scanIterator failure so cron doesn't crash", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    redis.scanIterator.mockImplementationOnce(() => {
      throw new Error("redis down");
    });
    await expect(main()).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("no-ops cleanly when no keys match", async () => {
    redis.scanIterator.mockReturnValueOnce(makeAsyncIterator([]));
    await expect(main()).resolves.toBeUndefined();
    expect(broadcastQueue.drain).not.toHaveBeenCalled();
  });
});
