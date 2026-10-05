const express = require("express");
const request = require("supertest");
const { createHmac } = require("node:crypto");
const { execFileSync } = require("node:child_process");

const originalEngine = process.env.BOT_ENGINE;
afterEach(() => {
  if (originalEngine === undefined) delete process.env.BOT_ENGINE;
  else process.env.BOT_ENGINE = originalEngine;
});

test.each(["invalid", "", "Native"])("invalid BOT_ENGINE %p throws on load", engine => {
  process.env.BOT_ENGINE = engine;
  jest.isolateModules(() => {
    expect(() => jest.requireActual("../../index")).toThrow(`Unknown BOT_ENGINE: ${engine}`);
  });
});

test.each([undefined, "bottender"])(
  "engine %p preserves legacy symbol identity and exact invalidation",
  async engine => {
    if (engine === undefined) delete process.env.BOT_ENGINE;
    else process.env.BOT_ENGINE = engine;
    let result;
    jest.isolateModules(() => {
      const facade = jest.requireActual("../../index");
      const legacy = jest.requireActual("bottender");
      expect(facade.engine).toBe("bottender");
      for (const name of [
        "chain",
        "withProps",
        "getClient",
        "Context",
        "LineContext",
        "bottender",
      ]) {
        expect(facade[name]).toBe(legacy[name]);
      }
      const redis = require("../../../../util/redis");
      redis.del.mockResolvedValueOnce(7);
      result = facade.clearLineSession("C1");
      expect(redis.del).toHaveBeenLastCalledWith("line:C1");
    });
    expect(await result).toBe(7);
  }
);

test("native selects once and does not load Bottender, server, or Redis merely by importing facade", () => {
  process.env.BOT_ENGINE = "native";
  jest.isolateModules(() => {
    const before = new Set(Object.keys(require.cache));
    const facade = jest.requireActual("../../index");
    expect(facade.engine).toBe("native");
    expect(facade.bottender).toBeUndefined();
    process.env.BOT_ENGINE = "bottender";
    expect(jest.requireActual("../../index")).toBe(facade);
    const added = Object.keys(require.cache).filter(path => !before.has(path));
    expect(added.some(path => /node_modules\/bottender\//.test(path))).toBe(false);
  });
  // Jest's isolated registry does not expose every module through require.cache.
  // Verify the real Node loader too, including the worker's getClient-only path.
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      `
    const assert = require('node:assert/strict');
    const bot = require('./src/lib/bot');
    assert.equal(bot.engine, 'native');
    assert.equal(bot.getClient('line'), bot.getClient('line'));
    const loaded = Object.keys(require.cache);
    assert(!loaded.some(p => p.includes('/node_modules/bottender/')));
    assert(!loaded.some(p => p.endsWith('/native/server.js') || p.endsWith('/native/state-store.js') || p.endsWith('/util/redis.js')));
    console.log('isolated native ok');
  `,
    ],
    {
      cwd: require("node:path").resolve(__dirname, "../../../../.."),
      env: { ...process.env, BOT_ENGINE: "native", LINE_ACCESS_TOKEN: "test-only-token" },
      encoding: "utf8",
    }
  );
  expect(output).toContain("isolated native ok");
});

test("native invalidation shares webhook queue and cannot resurrect an in-flight session", async () => {
  process.env.BOT_ENGINE = "native";
  await jest.isolateModulesAsync(async () => {
    const facade = jest.requireActual("../../index");
    const redis = require("../../../../util/redis");
    const data = new Map([["line:C1", "legacy untouched"]]);
    redis.get.mockImplementation(async key => data.get(key) ?? null);
    redis.set.mockImplementation(async (key, value) => data.set(key, value));
    redis.del.mockImplementation(async key => Number(data.delete(key)));
    let release;
    let started;
    const entered = new Promise(resolve => {
      started = resolve;
    });
    const barrier = new Promise(resolve => {
      release = resolve;
    });
    const server = express();
    const channelSecret = "test-only-secret";
    const handler = facade.mountWebhook(server, {
      app: async ctx => {
        started();
        await barrier;
        ctx.setState({ shouldDisappear: true });
      },
      client: { reply: jest.fn() },
      channelSecret,
      initialState: {},
    });
    const body = JSON.stringify({
      events: [{ type: "follow", source: { type: "group", groupId: "C1" } }],
    });
    await request(server)
      .post("/webhooks/line")
      .set("Content-Type", "application/json")
      .set("x-line-signature", createHmac("sha256", channelSecret).update(body).digest("base64"))
      .send(body)
      .expect(200);
    await entered;
    const invalidating = facade.clearLineSession("C1");
    expect(redis.del).not.toHaveBeenCalledWith("bot:native:v1:line:group:C1");
    release();
    expect(await invalidating).toBe(1);
    await handler.drain();
    expect(data.has("bot:native:v1:line:group:C1")).toBe(false);
    expect(data.get("line:C1")).toBe("legacy untouched");
  });
});

test("Guild delegates and preserves the facade return value", () => {
  jest.isolateModules(() => {
    const facade = require("../../index");
    const promise = Promise.resolve(4);
    facade.clearLineSession.mockReturnValueOnce(promise);
    const Guild = require("../../../../model/application/Guild");
    expect(Guild.clearLineSession("C1")).toBe(promise);
    expect(facade.clearLineSession).toHaveBeenCalledWith("C1");
  });
});

test("group cache transport keeps summary/count keys, return shapes and EX 60", async () => {
  let line;
  let client;
  let redis;
  jest.isolateModules(() => {
    const facade = require("../../index");
    client = {
      getGroupSummary: jest.fn().mockResolvedValue({ groupId: "C1", groupName: "name" }),
      getGroupMembersCount: jest.fn().mockResolvedValue(3),
    };
    facade.getClient.mockReturnValue(client);
    redis = require("../../../../util/redis");
    redis.get.mockResolvedValue(null);
    line = require("../../../../util/line");
  });
  expect(await line.getGroupSummary("C1")).toEqual({ groupId: "C1", groupName: "name" });
  expect(await line.getGroupCount("C1")).toEqual({ count: 3 });
  expect(redis.set).toHaveBeenCalledWith(
    "C1_summary",
    JSON.stringify({ groupId: "C1", groupName: "name" }),
    { EX: 60 }
  );
  expect(redis.set).toHaveBeenCalledWith("C1_count", '{"count":3}', { EX: 60 });
  redis.get.mockResolvedValueOnce('{"groupName":"cached"}').mockResolvedValueOnce('{"count":9}');
  expect(await line.getGroupSummary("C1")).toEqual({ groupName: "cached" });
  expect(await line.getGroupCount("C1")).toEqual({ count: 9 });
  expect(client.getGroupSummary).toHaveBeenCalledTimes(1);
  expect(client.getGroupMembersCount).toHaveBeenCalledTimes(1);
});
