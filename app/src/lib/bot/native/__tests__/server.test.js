const express = require("express");
const request = require("supertest");
const { createHmac } = require("node:crypto");
const { createWebhookHandler, mountWebhook } = require("../server");
const { createStateStore } = require("../state-store");

const channelSecret = "test-only-channel-secret";
const source = { type: "group", groupId: "C1", userId: "U1" };
function event(id = "one", from = source) {
  return {
    type: "message",
    source: from,
    replyToken: `token-${id}`,
    message: { type: "text", text: id },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness(options = {}) {
  const data = new Map();
  const redis = {
    get: jest.fn(async key => data.get(key) ?? null),
    set: jest.fn(async (key, value) => data.set(key, value)),
    del: jest.fn(async key => Number(data.delete(key))),
  };
  const logger = { error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  const store = createStateStore({ redis, logger });
  const client = { reply: jest.fn().mockResolvedValue({}) };
  const entry = jest.fn();
  const errorHandler = jest.fn();
  const app = express();
  const config = {
    app: entry,
    errorHandler,
    client,
    store,
    logger,
    channelSecret,
    initialState: {},
  };
  const handler = mountWebhook(app, { ...config, ...options });
  app.use(express.json());
  app.post("/api/echo", (req, res) => res.json(req.body));
  app.use((req, res) => res.sendStatus(404));
  function post(events = [event()], signature, destination = "bot-id") {
    const body = typeof events === "string" ? events : JSON.stringify({ destination, events });
    const signed = createHmac("sha256", channelSecret).update(body).digest("base64");
    const req = request(app).post("/webhooks/line").set("Content-Type", "application/json");
    if (signature !== null) req.set("x-line-signature", signature ?? signed);
    return req.send(body);
  }
  return { app, handler, entry, errorHandler, client, store, redis, data, logger, post };
}

test("valid signature ACKs before a blocked handler finishes; drain waits and stops acceptance", async () => {
  const h = harness();
  const entered = deferred();
  const release = deferred();
  h.entry.mockImplementation(async ctx => {
    expect(ctx.event.destination).toBe("bot-id");
    entered.resolve();
    await release.promise;
    ctx.setState({ saved: true });
  });
  await h.post().expect(200);
  await entered.promise;
  expect(h.redis.set).not.toHaveBeenCalled();
  let drained = false;
  const draining = h.handler.drain().then(() => {
    drained = true;
  });
  await h.post([event("rejected")]).expect(503);
  expect(drained).toBe(false);
  release.resolve();
  await draining;
  expect(await h.store.read(source)).toEqual({ saved: true });
  expect(h.entry).toHaveBeenCalledTimes(1);
  expect(h.entry.mock.calls[0][0].isSessionWritten).toBe(true);
});

test.each([null, "invalid-signature"])(
  "signature %p is rejected before state or handler",
  async signature => {
    const h = harness();
    await h.post([event()], signature).expect(401);
    await h.handler.drain();
    expect(h.entry).not.toHaveBeenCalled();
    expect(h.redis.get).not.toHaveBeenCalled();
    expect(h.redis.set).not.toHaveBeenCalled();
  }
);

test.each([
  '{"events":',
  "null",
  "{}",
  '{"events":{}}',
  '{"events":[null]}',
  '{"events":[{}]}',
  '{"destination":1,"events":[]}',
])("signed malformed body %s is rejected", async body => {
  const h = harness();
  await h.post(body).expect(400);
  await h.handler.drain();
  expect(h.entry).not.toHaveBeenCalled();
  expect(h.redis.get).not.toHaveBeenCalled();
});

test("JSON API and ordinary 404 remain reachable after webhook middleware", async () => {
  const h = harness();
  await request(h.app).post("/api/echo").send({ hello: "world" }).expect(200, { hello: "world" });
  await request(h.app).get("/missing").expect(404);
  await request(h.app).get("/webhooks/line").expect(404);
  expect(h.entry).not.toHaveBeenCalled();
});

test("empty and legacy verify events skip all state operations; mixed webhook retains real events", async () => {
  const h = harness();
  await h.post([]).expect(200);
  const verify = ["0", "f"].map(char => ({
    ...event(),
    source: undefined,
    replyToken: char.repeat(32),
  }));
  await h.post(verify).expect(200);
  expect(h.redis.get).not.toHaveBeenCalled();
  await h.post([...verify, event()]).expect(200);
  await h.handler.drain();
  expect(h.entry).toHaveBeenCalledTimes(1);
  expect(h.redis.get).toHaveBeenCalledTimes(1);
  expect(h.redis.set).toHaveBeenCalledTimes(1);
});

test("unknown/missing sources skip only those events; unknown event type with valid source runs", async () => {
  const h = harness();
  await h
    .post([
      { ...event(), source: undefined },
      event("bad", { type: "other", otherId: "bad" }),
      event("missing-id", { type: "group" }),
      { ...event(), type: "future-line-event" },
    ])
    .expect(200);
  await h.handler.drain();
  expect(h.logger.error).toHaveBeenCalledTimes(3);
  expect(h.entry).toHaveBeenCalledTimes(1);
  expect(h.redis.set).toHaveBeenCalledTimes(1);
});

test.each([false, true])(
  "same-source FIFO reads AFTER predecessor saves (separate requests=%p)",
  async separate => {
    const h = harness({ initialState: { seen: [] } });
    const entered = deferred();
    const release = deferred();
    const snapshots = [];
    h.entry.mockImplementation(async ctx => {
      snapshots.push([...ctx.state.seen]);
      if (ctx.event.text === "one") {
        entered.resolve();
        await release.promise;
      }
      ctx.state.seen.push(ctx.event.text);
    });
    const second = event("two", { ...source, userId: "U2" });
    await h.post(separate ? [event()] : [event(), second]).expect(200);
    await entered.promise;
    if (separate) await h.post([second]).expect(200);
    expect(h.redis.get).toHaveBeenCalledTimes(1);
    release.resolve();
    await h.handler.drain();
    expect(snapshots).toEqual([[], ["one"]]);
    expect(await h.store.read(source)).toEqual({ seen: ["one", "two"] });
  }
);

test("different sources run in parallel", async () => {
  const h = harness();
  const release = deferred();
  const secondStarted = deferred();
  h.entry.mockImplementation(async ctx => {
    if (ctx.event.source.groupId === "C1") await release.promise;
    else secondStarted.resolve();
  });
  await h.post([event(), event("two", { ...source, groupId: "C2" })]).expect(200);
  await secondStarted.promise;
  expect(h.entry).toHaveBeenCalledTimes(2);
  release.resolve();
  await h.handler.drain();
  expect(h.redis.set).toHaveBeenCalledTimes(2);
});

test("handler failure skips flush, drives errorHandler with {error}, and saves resulting state", async () => {
  const h = harness();
  const error = new Error("handler failed");
  h.entry.mockImplementation(ctx => {
    ctx.setState({ before: true });
    ctx.replyText("must not flush");
    throw error;
  });
  const continuation = jest.fn((ctx, props) => {
    expect(props).toEqual({});
    ctx.setState({ recovered: true });
  });
  h.errorHandler.mockReturnValue(continuation);
  await h.post().expect(200);
  await h.handler.drain();
  const ctx = h.entry.mock.calls[0][0];
  expect(h.errorHandler).toHaveBeenCalledWith(ctx, { error });
  expect(continuation).toHaveBeenCalledTimes(1);
  expect(h.client.reply).not.toHaveBeenCalled();
  expect(await h.store.read(source)).toEqual({ before: true, recovered: true });
});

test("errorHandler failure prevents save without poisoning the next same-source event", async () => {
  const h = harness();
  h.entry.mockImplementationOnce(ctx => {
    ctx.setState({ lost: true });
    throw new Error("handler failed");
  });
  h.errorHandler.mockRejectedValue(new Error("error handler failed"));
  await h.post([event(), event("two")]).expect(200);
  await h.handler.drain();
  expect(h.entry).toHaveBeenCalledTimes(2);
  expect(h.redis.set).toHaveBeenCalledTimes(1);
  expect(await h.store.read(source)).toEqual({});
  expect(h.logger.error).toHaveBeenCalledWith(
    "Native webhook failure",
    expect.objectContaining({ phase: "errorHandler" })
  );
});

test("reply rejection invokes error handler then saves, with six messages in one call and no retry", async () => {
  const h = harness();
  const error = new Error("LINE rejects six messages");
  h.client.reply.mockRejectedValue(error);
  h.entry.mockImplementation(ctx => {
    ctx.setState({ rewarded: true });
    for (let i = 0; i < 6; i++) ctx.replyText(String(i));
  });
  await h.post().expect(200);
  await h.handler.drain();
  expect(h.client.reply).toHaveBeenCalledTimes(1);
  expect(h.client.reply.mock.calls[0][1]).toHaveLength(6);
  expect(h.errorHandler).toHaveBeenCalledWith(h.entry.mock.calls[0][0], { error });
  expect(await h.store.read(source)).toEqual({ rewarded: true });
});

test.each(["STATE_CORRUPT", "redis-down"])(
  "read failure %s never executes or overwrites",
  async failure => {
    const h = harness();
    const key = h.store.sourceKey(source);
    if (failure === "STATE_CORRUPT") h.data.set(key, "broken-json");
    else h.redis.get.mockRejectedValue(new Error("redis down"));
    await h.post().expect(200);
    await h.handler.drain();
    expect(h.entry).not.toHaveBeenCalled();
    expect(h.errorHandler).not.toHaveBeenCalled();
    expect(h.redis.set).not.toHaveBeenCalled();
    if (failure === "STATE_CORRUPT") expect(h.data.get(key)).toBe("broken-json");
    expect(h.logger.error).toHaveBeenCalled();
  }
);

test("write failure is logged without replaying handler or reply", async () => {
  const h = harness();
  h.redis.set.mockRejectedValue(new Error("write failed"));
  h.entry.mockImplementation(ctx => ctx.replyText("once"));
  await h.post().expect(200);
  await h.handler.drain();
  expect(h.entry).toHaveBeenCalledTimes(1);
  expect(h.client.reply).toHaveBeenCalledTimes(1);
  expect(h.errorHandler).not.toHaveBeenCalled();
  expect(h.logger.error).toHaveBeenCalledWith(
    "Native webhook failure",
    expect.objectContaining({ phase: "write" })
  );
});

test("drain includes ACKed callbacks not yet enqueued in the store", async () => {
  const h = harness();
  const scheduled = [];
  const immediate = jest.spyOn(global, "setImmediate").mockImplementation(fn => scheduled.push(fn));
  try {
    await h.post().expect(200);
    expect(h.store.pendingCount()).toBe(0);
    expect(h.entry).not.toHaveBeenCalled();
    let done = false;
    const draining = h.handler.drain().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    scheduled.forEach(fn => fn());
    await draining;
    expect(h.entry).toHaveBeenCalledTimes(1);
    expect(h.redis.set).toHaveBeenCalledTimes(1);
  } finally {
    immediate.mockRestore();
  }
});

test("missing entry fails at startup", () => {
  expect(() => createWebhookHandler({ channelSecret })).toThrow("Missing native bot entry action");
});
