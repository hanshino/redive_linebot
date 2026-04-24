// jest.config disables babel transform — jest.mock must precede requires.
// See feedback_jest_mock_hoisting.md
jest.mock("../../src/util/broadcastQueue", () => ({
  drain: jest.fn().mockResolvedValue({ drained: 0 }),
}));

const broadcastQueue = require("../../src/util/broadcastQueue");
const { tryDrainBroadcast } = require("../../bin/EventDequeue").__testing;

function makeEvent(type, id) {
  return { source: { type, [`${type}Id`]: id } };
}

function flush() {
  // give fire-and-forget drain a microtask tick to resolve
  return new Promise(resolve => setImmediate(resolve));
}

describe("EventDequeue.tryDrainBroadcast", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls broadcastQueue.drain for group events", async () => {
    tryDrainBroadcast(makeEvent("group", "Ggrp1"));
    await flush();
    expect(broadcastQueue.drain).toHaveBeenCalledWith("Ggrp1", expect.any(Object));
  });

  it("calls broadcastQueue.drain for room events", async () => {
    tryDrainBroadcast(makeEvent("room", "Rrm1"));
    await flush();
    expect(broadcastQueue.drain).toHaveBeenCalledWith("Rrm1", expect.any(Object));
  });

  it("does NOT call drain for user events (1:1 chat)", async () => {
    tryDrainBroadcast(makeEvent("user", "Uuser1"));
    await flush();
    expect(broadcastQueue.drain).not.toHaveBeenCalled();
  });

  it("does not await drain — returns synchronously before drain resolves", () => {
    let resolved = false;
    broadcastQueue.drain.mockImplementationOnce(
      () =>
        new Promise(res =>
          setTimeout(() => {
            resolved = true;
            res({ drained: 1 });
          }, 20)
        )
    );
    tryDrainBroadcast(makeEvent("group", "Ggrp1"));
    // drain still running — call should have returned already
    expect(resolved).toBe(false);
  });

  it("swallows drain errors without throwing", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    broadcastQueue.drain.mockRejectedValueOnce(new Error("boom"));
    expect(() => tryDrainBroadcast(makeEvent("group", "Ggrp1"))).not.toThrow();
    await flush();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
