function createStateStore({
  redis,
  ttlSeconds = 3600,
  prefix = "bot:native:v1:line",
  logger = console,
}) {
  // ponytail: single webhook process; horizontal replicas require a Redis-backed per-source queue/lock
  const queues = new Map();

  function log(level, ...args) {
    try {
      logger[level]?.(...args);
    } catch {
      // Logging must not change task results or prevent queue cleanup.
    }
  }

  function sourceKey(source) {
    const type = source?.type;
    if (!["user", "group", "room"].includes(type)) {
      throw new TypeError("Unknown LINE source type");
    }
    const id = source[`${type}Id`];
    if (typeof id !== "string" || !id) {
      throw new TypeError(`Missing LINE ${type} ID`);
    }
    return `${prefix}:${type}:${id}`;
  }

  function isState(state) {
    return state !== null && typeof state === "object" && !Array.isArray(state);
  }

  async function read(source) {
    const key = sourceKey(source);
    const raw = await redis.get(key);
    if (raw === null) return null;
    try {
      const payload = JSON.parse(raw);
      if (payload?.version !== 1 || !isState(payload.state)) {
        throw new Error("Invalid state payload");
      }
      return payload.state;
    } catch {
      const error = new Error(`Corrupt native state at ${key}`);
      error.code = "STATE_CORRUPT";
      log("error", error);
      throw error;
    }
  }

  async function write(source, state) {
    const key = sourceKey(source);
    if (!isState(state)) throw new TypeError("State must be an object");
    const payload = JSON.stringify({ version: 1, state, lastActivity: Date.now() });
    return redis.set(key, payload, { EX: ttlSeconds });
  }

  async function destroy(source) {
    return redis.del(sourceKey(source));
  }

  function runSerial(source, task) {
    const key = sourceKey(source);
    const enqueuedAt = Date.now();
    const result = (queues.get(key) || Promise.resolve()).then(async () => {
      const startedAt = Date.now();
      try {
        return await task();
      } finally {
        log("debug", "Native state queue", {
          key,
          waitMs: startedAt - enqueuedAt,
          executionMs: Date.now() - startedAt,
          pendingCount: queues.size,
        });
      }
    });
    const cleanup = () => {
      if (queues.get(key) === settled) queues.delete(key);
    };
    const settled = result.then(cleanup, cleanup);
    queues.set(key, settled);
    return result;
  }

  async function drain() {
    while (queues.size) await Promise.all(queues.values());
  }

  return {
    sourceKey,
    read,
    write,
    destroy,
    runSerial,
    // Count source queues, including both running and waiting work.
    pendingCount: () => queues.size,
    drain,
  };
}

module.exports = { createStateStore };
