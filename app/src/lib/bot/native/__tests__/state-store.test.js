const { createStateStore } = require("../state-store");

function deferred() {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function fakeRedis() {
  const values = new Map();
  return {
    values,
    get: jest.fn(async key => values.get(key) ?? null),
    set: jest.fn(async (key, value) => {
      values.set(key, value);
      return "OK";
    }),
    del: jest.fn(async key => Number(values.delete(key))),
    expire: jest.fn(),
  };
}

const user = { type: "user", userId: "U1" };
const group = { type: "group", groupId: "C1", userId: "U1" };
const otherMember = { ...group, userId: "U2" };

describe("native state store", () => {
  let redis;
  let logger;
  let store;

  beforeEach(() => {
    redis = fakeRedis();
    logger = { error: jest.fn(), debug: jest.fn() };
    store = createStateStore({ redis, logger });
  });

  test("keys preserve conversation scope and separate source types", () => {
    expect(store.sourceKey(user)).toBe("bot:native:v1:line:user:U1");
    expect(store.sourceKey(group)).toBe("bot:native:v1:line:group:C1");
    expect(store.sourceKey(otherMember)).toBe(store.sourceKey(group));
    expect(store.sourceKey({ type: "group", groupId: "C2" })).not.toBe(store.sourceKey(group));
    expect(store.sourceKey({ type: "room", roomId: "R1" })).toBe("bot:native:v1:line:room:R1");
    expect(store.sourceKey({ type: "room", roomId: "R1", userId: "U2" })).toBe(
      store.sourceKey({ type: "room", roomId: "R1", userId: "U1" })
    );
    expect(store.sourceKey({ type: "group", groupId: "U1" })).not.toBe(store.sourceKey(user));
  });

  test.each([
    undefined,
    null,
    {},
    { type: "unknown", userId: "U1" },
    { type: "user" },
    { type: "group", userId: "U1" },
    { type: "room", userId: "U1" },
    { type: "user", userId: "" },
    { type: "user", userId: 1 },
  ])("invalid source %j throws TypeError", source => {
    expect(() => store.sourceKey(source)).toThrow(TypeError);
  });

  test("miss is null; JSON round-trip preserves nested state without merging defaults", async () => {
    expect(await store.read(group)).toBeNull();
    const state = {
      userDatas: { U1: { name: "member" } },
      values: ["text", 2, true, null],
      date: new Date("2026-10-05T00:00:00Z"),
      omitted: undefined,
    };
    const before = Date.now();
    await store.write(group, state);
    const payload = JSON.parse(redis.values.get(store.sourceKey(group)));
    expect(payload).toEqual({
      version: 1,
      state: JSON.parse(JSON.stringify(state)),
      lastActivity: expect.any(Number),
    });
    expect(payload.lastActivity).toBeGreaterThanOrEqual(before);
    expect(payload.lastActivity).toBeLessThanOrEqual(Date.now());
    const loaded = await store.read(otherMember);
    expect(loaded).toEqual(payload.state);
    loaded.userDatas.U1.name = "changed";
    expect((await store.read(group)).userDatas.U1.name).toBe("member");
    expect(await store.read(user)).toBeNull();
  });

  test("every write sets EX 3600; neither hit nor miss refreshes TTL", async () => {
    await store.write(group, {});
    await store.write(group, {});
    expect(redis.set).toHaveBeenCalledTimes(2);
    for (const call of redis.set.mock.calls) {
      expect(call).toEqual([store.sourceKey(group), expect.any(String), { EX: 3600 }]);
    }
    redis.set.mockClear();
    await store.read(group);
    await store.read(user);
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.expire).not.toHaveBeenCalled();
  });

  test("custom prefix and TTL; destroy deletes only the native key", async () => {
    store = createStateStore({ redis, logger, prefix: "test:native", ttlSeconds: 120 });
    redis.values.set("line:C1", "legacy");
    await store.write(group, {});
    expect(redis.set).toHaveBeenCalledWith("test:native:group:C1", expect.any(String), { EX: 120 });
    await store.destroy(otherMember);
    expect(redis.del).toHaveBeenCalledWith("test:native:group:C1");
    expect(await store.read(group)).toBeNull();
    expect(redis.values.get("line:C1")).toBe("legacy");
  });

  test.each([
    "{broken",
    "",
    "null",
    "[]",
    "42",
    "{}",
    '{"version":2,"state":{}}',
    '{"version":"1","state":{}}',
    '{"version":1}',
    '{"version":1,"state":null}',
    '{"version":1,"state":[]}',
    '{"version":1,"state":"text"}',
    '{"version":1,"state":false}',
    '{"version":1,"state":1}',
  ])("corrupt payload %s rejects without overwriting data", async raw => {
    redis.values.set(store.sourceKey(group), raw);
    await expect(store.read(group)).rejects.toMatchObject({ code: "STATE_CORRUPT" });
    expect(logger.error).toHaveBeenCalledWith(expect.any(Error));
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.values.get(store.sourceKey(group))).toBe(raw);
  });

  test("Redis failures propagate unchanged rather than becoming misses or success", async () => {
    const error = new Error("Redis unavailable");
    redis.get.mockRejectedValueOnce(error);
    redis.set.mockRejectedValueOnce(error);
    redis.del.mockRejectedValueOnce(error);
    await expect(store.read(user)).rejects.toBe(error);
    await expect(store.write(user, {})).rejects.toBe(error);
    await expect(store.destroy(user)).rejects.toBe(error);
  });

  test("invalid or unserializable state never reaches SET", async () => {
    for (const state of [null, undefined, [], "text", 1, false]) {
      await expect(store.write(user, state)).rejects.toThrow(TypeError);
    }
    const circular = {};
    circular.self = circular;
    await expect(store.write(user, circular)).rejects.toThrow(TypeError);
    expect(redis.set).not.toHaveBeenCalled();
  });

  test("same-source tasks are FIFO across the complete read/execute/write lifecycle", async () => {
    const entered = deferred();
    const release = deferred();
    const enteredSecond = deferred();
    const releaseSecond = deferred();
    const order = [];
    const first = store.runSerial(group, async () => {
      order.push(1);
      expect(await store.read(group)).toBeNull();
      entered.resolve();
      await release.promise;
      await store.write(group, { userDatas: { U1: true } });
      return "first";
    });
    const second = store.runSerial(otherMember, async () => {
      order.push(2);
      enteredSecond.resolve();
      await releaseSecond.promise;
      const state = await store.read(otherMember);
      state.userDatas.U2 = true;
      await store.write(otherMember, state);
      return "second";
    });
    const third = store.runSerial(group, () => {
      order.push(3);
      return "third";
    });
    await entered.promise;
    expect(order).toEqual([1]);
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(store.pendingCount()).toBe(1);
    release.resolve();
    await first;
    await enteredSecond.promise;
    expect(order).toEqual([1, 2]);
    expect(store.pendingCount()).toBe(1);
    releaseSecond.resolve();
    expect(await Promise.all([first, second, third])).toEqual(["first", "second", "third"]);
    expect(order).toEqual([1, 2, 3]);
    expect(await store.read(group)).toEqual({ userDatas: { U1: true, U2: true } });
    expect(store.pendingCount()).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith("Native state queue", {
      key: store.sourceKey(group),
      waitMs: expect.any(Number),
      executionMs: expect.any(Number),
      pendingCount: 1,
    });
  });

  test("queued invalidation waits for persistence and cannot resurrect the session", async () => {
    const entered = deferred();
    const release = deferred();
    const event = store.runSerial(group, async () => {
      entered.resolve();
      await release.promise;
      await store.write(group, { guildConfig: { Battle: "Y" } });
    });
    await entered.promise;
    const invalidation = store.runSerial(group, () => store.destroy(group));
    const next = store.runSerial(otherMember, () => store.read(otherMember));
    expect(redis.del).not.toHaveBeenCalled();
    release.resolve();
    await event;
    await invalidation;
    await expect(next).resolves.toBeNull();
    expect(store.pendingCount()).toBe(0);
  });

  test.each([false, true])("task rejection (async=%s) does not poison the queue", async isAsync => {
    const error = new Error("task failed");
    const failed = store.runSerial(group, () => {
      if (isAsync) return Promise.reject(error);
      throw error;
    });
    const rejection = expect(failed).rejects.toBe(error);
    const next = store.runSerial(otherMember, () => "recovered");
    await rejection;
    await expect(next).resolves.toBe("recovered");
    expect(store.pendingCount()).toBe(0);
    await store.drain();
  });

  test("different sources run concurrently; drain waits for all work, including new queues", async () => {
    const enteredGroup = deferred();
    const enteredUser = deferred();
    const releaseGroup = deferred();
    const releaseUser = deferred();
    const releaseRoom = deferred();
    const groupTask = store.runSerial(group, async () => {
      enteredGroup.resolve();
      await releaseGroup.promise;
    });
    const userTask = store.runSerial(user, async () => {
      enteredUser.resolve();
      await releaseUser.promise;
      throw new Error("expected rejection");
    });
    const rejection = expect(userTask).rejects.toThrow("expected rejection");
    await Promise.all([enteredGroup.promise, enteredUser.promise]);
    expect(store.pendingCount()).toBe(2);
    let drained = false;
    const draining = store.drain().then(() => {
      drained = true;
    });
    const roomTask = store.runSerial({ type: "room", roomId: "R1" }, () => releaseRoom.promise);
    releaseGroup.resolve();
    await groupTask;
    expect(store.pendingCount()).toBe(2);
    expect(drained).toBe(false);
    releaseUser.resolve();
    await rejection;
    expect(store.pendingCount()).toBe(1);
    expect(drained).toBe(false);
    releaseRoom.resolve();
    await roomTask;
    await draining;
    expect(drained).toBe(true);
    expect(store.pendingCount()).toBe(0);
    await store.drain();
  });

  test("logging failures do not replace results/rejections or prevent cleanup", async () => {
    logger.debug.mockImplementation(() => {
      throw new Error("logger failed");
    });
    await expect(store.runSerial(user, () => "ok")).resolves.toBe("ok");
    const error = new Error("task failed");
    await expect(store.runSerial(user, () => Promise.reject(error))).rejects.toBe(error);
    expect(store.pendingCount()).toBe(0);
    await store.drain();
  });
});
