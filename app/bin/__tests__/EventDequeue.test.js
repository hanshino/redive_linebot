// Keep client resolution outside the per-message drain path.

describe("bin/EventDequeue ioredis leak guard", () => {
  let mockBot;
  let bin;

  beforeAll(() => {
    jest.resetModules();
    // Grab the fresh mock factory instance AFTER resetModules — the bin
    // script will receive the same instance because both requires happen
    // post-reset.
    mockBot = require("../../src/lib/bot");
    bin = require("../EventDequeue");
  });

  it("requires getClient exactly once at module load", () => {
    expect(mockBot.getClient).toHaveBeenCalledTimes(1);
    expect(mockBot.getClient).toHaveBeenCalledWith("line");
  });

  it("never reinvokes getClient when tryDrainBroadcast fires repeatedly", () => {
    const event = {
      source: { type: "group", groupId: "Cabcdef0123456789abcdef0123456789" },
    };

    for (let i = 0; i < 50; i++) {
      bin.__testing.tryDrainBroadcast(event);
    }

    expect(mockBot.getClient).toHaveBeenCalledTimes(1);
  });
});
