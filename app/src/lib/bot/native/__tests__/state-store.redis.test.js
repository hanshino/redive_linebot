const { createClient } = jest.requireActual("redis");
const { createStateStore } = require("../state-store");

const describeRedis = process.env.REDIS_INTEGRATION === "1" ? describe : describe.skip;

function deferred() {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describeRedis("native state store with real Redis", () => {
  const prefix = `test:bot-native:${process.pid}:${Date.now()}:`;
  const user = { type: "user", userId: "U1" };
  const group = { type: "group", groupId: "C1", userId: "U1" };
  const otherMember = { ...group, userId: "U2" };
  const logger = { error: jest.fn(), debug: jest.fn() };
  const connectionErrors = [];
  let redis;
  let store;
  let testId = 0;

  beforeAll(async () => {
    redis = createClient({
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: Number(process.env.REDIS_PORT || 6379),
        connectTimeout: 3000,
        reconnectStrategy: false,
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });
    redis.on("error", error => connectionErrors.push(error));
    await redis.connect();
    expect(await redis.ping()).toBe("PONG");
  });

  beforeEach(() => {
    store = createStateStore({ redis, logger, prefix: `${prefix}${++testId}` });
  });

  afterEach(async () => {
    await store.drain();
    expect(store.activeSourceCount()).toBe(0);
    expect(store.pendingTaskCount()).toBe(0);
  });

  afterAll(async () => {
    if (!redis?.isOpen) return;
    try {
      const keys = [];
      // node-redis v5 yields batches; only delete this suite's unique namespace.
      for await (const batch of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
        keys.push(...batch);
      }
      if (keys.length) await redis.del(keys);
      const remaining = [];
      for await (const batch of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
        remaining.push(...batch);
      }
      expect(remaining).toEqual([]);
      expect(connectionErrors).toEqual([]);
    } finally {
      await redis.quit();
    }
  });

  test("nested JSON round-trip and default 3600-second TTL", async () => {
    const state = {
      userDatas: { U1: { name: "成員", flags: [true, null, 2] } },
      guildConfig: { Battle: "Y" },
    };
    expect(await store.read(group)).toBeNull();
    await store.write(group, state);
    expect(await store.read(otherMember)).toEqual(state);
    expect(JSON.parse(await redis.get(store.sourceKey(group)))).toEqual({
      version: 1,
      state,
      lastActivity: expect.any(Number),
    });
    const ttl = await redis.ttl(store.sourceKey(group));
    expect(ttl).toBeGreaterThanOrEqual(3590);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  test("read leaves a shortened TTL alone; write refreshes it", async () => {
    // Shorten server-side instead of sleeping or faking the client's clock.
    const key = store.sourceKey(user);
    await store.write(user, { count: 1 });
    await redis.expire(key, 30);
    const beforeRead = await redis.ttl(key);
    expect(await store.read(user)).toEqual({ count: 1 });
    const afterRead = await redis.ttl(key);
    expect(afterRead).toBeGreaterThanOrEqual(0);
    expect(afterRead).toBeLessThanOrEqual(beforeRead);
    expect(afterRead).toBeLessThanOrEqual(30);
    await store.write(user, { count: 2 });
    const refreshed = await redis.ttl(key);
    expect(refreshed).toBeGreaterThanOrEqual(3590);
    expect(refreshed).toBeLessThanOrEqual(3600);
    expect(await store.read(user)).toEqual({ count: 2 });
  });

  test("destroy removes the persisted key", async () => {
    await store.write(user, { present: true });
    await store.destroy(user);
    expect(await redis.exists(store.sourceKey(user))).toBe(0);
    expect(await store.read(user)).toBeNull();
  });

  test("user, group and room namespaces are isolated even with identical IDs", async () => {
    const sources = [
      { type: "user", userId: "same" },
      { type: "group", groupId: "same", userId: "U1" },
      { type: "room", roomId: "same", userId: "U1" },
    ];
    expect(new Set(sources.map(source => store.sourceKey(source))).size).toBe(3);
    await Promise.all(sources.map(source => store.write(source, { type: source.type })));
    for (const source of sources) {
      expect(await store.read(source)).toEqual({ type: source.type });
    }
    await store.destroy(sources[0]);
    expect(await store.read(sources[1])).toEqual({ type: "group" });
    expect(await store.read(sources[2])).toEqual({ type: "room" });
  });

  test("corrupt JSON rejects with STATE_CORRUPT and is not overwritten", async () => {
    const key = store.sourceKey(user);
    await redis.set(key, "{garbage");
    await expect(store.read(user)).rejects.toMatchObject({ code: "STATE_CORRUPT" });
    expect(await redis.get(key)).toBe("{garbage");
  });

  test("concurrent same-source read-modify-write tasks preserve both updates", async () => {
    await store.write(group, { userDatas: {} });
    const entered = deferred();
    const release = deferred();
    const tasks = [];
    let secondStarted = false;
    tasks.push(
      store.runSerial(group, async () => {
        const state = await store.read(group);
        entered.resolve();
        await release.promise;
        state.userDatas.U1 = true;
        await store.write(group, state);
      })
    );
    try {
      await Promise.race([entered.promise, tasks[0]]);
      tasks.push(
        store.runSerial(otherMember, async () => {
          secondStarted = true;
          const state = await store.read(otherMember);
          state.userDatas.U2 = true;
          await store.write(otherMember, state);
        })
      );
      // Give an incorrectly parallel implementation a chance to start task 2.
      await Promise.resolve();
      expect(secondStarted).toBe(false);
      expect(store.pendingTaskCount()).toBe(2);
    } finally {
      release.resolve();
      await Promise.allSettled(tasks);
    }
    await Promise.all(tasks);
    expect(await store.read(group)).toEqual({ userDatas: { U1: true, U2: true } });
  });

  test("queued clearLineSession-style destroy cannot be resurrected by an earlier write", async () => {
    const entered = deferred();
    const release = deferred();
    const tasks = [];
    tasks.push(
      store.runSerial(group, async () => {
        entered.resolve();
        await release.promise;
        await store.write(group, { guildConfig: { Battle: "Y" } });
      })
    );
    try {
      await Promise.race([entered.promise, tasks[0]]);
      tasks.push(store.runSerial(otherMember, () => store.destroy(otherMember)));
      expect(store.pendingTaskCount()).toBe(2);
    } finally {
      release.resolve();
      await Promise.allSettled(tasks);
    }
    await Promise.all(tasks);
    expect(await store.read(group)).toBeNull();
    expect(await redis.exists(store.sourceKey(group))).toBe(0);
  });
});
