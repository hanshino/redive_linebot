// Regression: bottender@1.5.5 `getClient()` is not memoized — each call opens
// a fresh ioredis session-store socket that's never quit() when the bot
// reference is GC'd. The worker's `tryDrainBroadcast` runs per inbound
// group/room message, so calling getClient inside the function body leaks
// a Redis connection per event (production: ~10k connections in 18h →
// maxclients ceiling). This test guards the hoist to module load.

describe("bin/EventDequeue ioredis leak guard", () => {
  let mockBottender;
  let bin;

  beforeAll(() => {
    jest.resetModules();
    // Grab the fresh mock factory instance AFTER resetModules — the bin
    // script will receive the same instance because both requires happen
    // post-reset.
    mockBottender = require("bottender");
    bin = require("../EventDequeue");
  });

  it("requires getClient exactly once at module load", () => {
    expect(mockBottender.getClient).toHaveBeenCalledTimes(1);
    expect(mockBottender.getClient).toHaveBeenCalledWith("line");
  });

  it("never reinvokes getClient when tryDrainBroadcast fires repeatedly", () => {
    const event = {
      source: { type: "group", groupId: "Cabcdef0123456789abcdef0123456789" },
    };

    for (let i = 0; i < 50; i++) {
      bin.__testing.tryDrainBroadcast(event);
    }

    expect(mockBottender.getClient).toHaveBeenCalledTimes(1);
  });
});
