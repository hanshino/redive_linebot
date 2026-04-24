const broadcastQueue = require("../../src/util/broadcastQueue");
const redis = require("../../src/util/redis");

describe("broadcastQueue.pushEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("LPUSHes a JSON-stringified event into BROADCAST_QUEUE_{groupId}", async () => {
    const event = {
      type: "trial_enter",
      userId: "Uabc",
      text: "踏入了 ★1 的試煉",
      payload: { trialId: 1, trialStar: 1, trialSlug: "departure" },
    };
    await broadcastQueue.pushEvent("Ggroup1", event);

    expect(redis.lPush).toHaveBeenCalledTimes(1);
    const [key, payload] = redis.lPush.mock.calls[0];
    expect(key).toBe("BROADCAST_QUEUE_Ggroup1");
    const parsed = JSON.parse(payload);
    expect(parsed.type).toBe("trial_enter");
    expect(parsed.userId).toBe("Uabc");
    expect(parsed.text).toBe("踏入了 ★1 的試煉");
    expect(parsed.payload).toEqual({ trialId: 1, trialStar: 1, trialSlug: "departure" });
    expect(typeof parsed.createdAt).toBe("number");
  });

  it("sets 24h EXPIRE on the key", async () => {
    await broadcastQueue.pushEvent("Ggroup1", { type: "prestige", userId: "Uabc" });
    expect(redis.expire).toHaveBeenCalledWith("BROADCAST_QUEUE_Ggroup1", 86400);
  });

  it("preserves caller-supplied createdAt when present", async () => {
    await broadcastQueue.pushEvent("Ggroup1", {
      type: "prestige",
      userId: "Uabc",
      createdAt: 1700000000000,
    });
    const [, payload] = redis.lPush.mock.calls[0];
    expect(JSON.parse(payload).createdAt).toBe(1700000000000);
  });

  it("returns false and does nothing when groupId is null", async () => {
    const result = await broadcastQueue.pushEvent(null, { type: "trial_enter", userId: "Uabc" });
    expect(result).toBe(false);
    expect(redis.lPush).not.toHaveBeenCalled();
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it("returns false and does nothing when groupId is empty string", async () => {
    const result = await broadcastQueue.pushEvent("", { type: "trial_enter", userId: "Uabc" });
    expect(result).toBe(false);
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("returns false and does nothing when groupId is undefined", async () => {
    const result = await broadcastQueue.pushEvent(undefined, {
      type: "trial_enter",
      userId: "Uabc",
    });
    expect(result).toBe(false);
    expect(redis.lPush).not.toHaveBeenCalled();
  });
});

describe("broadcastQueue.BROADCAST_QUEUE_KEY", () => {
  it("formats the key", () => {
    expect(broadcastQueue.BROADCAST_QUEUE_KEY("Gxyz")).toBe("BROADCAST_QUEUE_Gxyz");
  });
});
