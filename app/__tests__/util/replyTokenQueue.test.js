const redis = require("../../src/util/redis");
const replyTokenQueue = require("../../src/util/replyTokenQueue");

describe("replyTokenQueue.saveToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("ZADDs token with timestamp score under REPLY_TOKEN_QUEUE_{sourceId}", async () => {
    await replyTokenQueue.saveToken("Gabc", "tok-1", 1700000000000);
    expect(redis.zAdd).toHaveBeenCalledWith(
      "REPLY_TOKEN_QUEUE_Gabc",
      expect.objectContaining({ score: 1700000000000, value: "tok-1" })
    );
  });

  it("trims to newest 5 tokens via ZREMRANGEBYRANK 0 -6", async () => {
    await replyTokenQueue.saveToken("Gabc", "tok-1", 1700000000000);
    expect(redis.zRemRangeByRank).toHaveBeenCalledWith("REPLY_TOKEN_QUEUE_Gabc", 0, -6);
  });

  it("drops tokens older than 55s via ZREMRANGEBYSCORE", async () => {
    const now = 1700000000000;
    await replyTokenQueue.saveToken("Gabc", "tok-1", now);
    expect(redis.zRemRangeByScore).toHaveBeenCalledWith("REPLY_TOKEN_QUEUE_Gabc", 0, now - 55000);
  });

  it("sets 55s EXPIRE on the key", async () => {
    await replyTokenQueue.saveToken("Gabc", "tok-1", 1700000000000);
    expect(redis.expire).toHaveBeenCalledWith("REPLY_TOKEN_QUEUE_Gabc", 55);
  });

  it("no-ops when sourceId is falsy", async () => {
    await replyTokenQueue.saveToken(null, "tok-1", 1700000000000);
    await replyTokenQueue.saveToken("", "tok-1", 1700000000000);
    expect(redis.zAdd).not.toHaveBeenCalled();
  });

  it("no-ops when token is falsy", async () => {
    await replyTokenQueue.saveToken("Gabc", null, 1700000000000);
    await replyTokenQueue.saveToken("Gabc", "", 1700000000000);
    expect(redis.zAdd).not.toHaveBeenCalled();
  });

  it("defaults timestamp to Date.now() when not provided", async () => {
    const before = Date.now();
    await replyTokenQueue.saveToken("Gabc", "tok-1");
    const after = Date.now();
    const args = redis.zAdd.mock.calls[0][1];
    expect(args.score).toBeGreaterThanOrEqual(before);
    expect(args.score).toBeLessThanOrEqual(after);
  });
});

describe("replyTokenQueue.pullFreshToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when no fresh token is available", async () => {
    redis.zRangeByScore.mockResolvedValueOnce([]);
    const token = await replyTokenQueue.pullFreshToken("Gabc");
    expect(token).toBeNull();
  });

  it("returns the newest fresh token (last entry from zRangeByScore)", async () => {
    // zRangeByScore returns ascending by score; newest = last
    redis.zRangeByScore.mockResolvedValueOnce(["tok-old", "tok-mid", "tok-new"]);
    const token = await replyTokenQueue.pullFreshToken("Gabc");
    expect(token).toBe("tok-new");
  });

  it("ZREMs the pulled token so it's not reused", async () => {
    redis.zRangeByScore.mockResolvedValueOnce(["tok-a"]);
    await replyTokenQueue.pullFreshToken("Gabc");
    expect(redis.zRem).toHaveBeenCalledWith("REPLY_TOKEN_QUEUE_Gabc", "tok-a");
  });

  it("queries with min = now - 55000, max = +inf", async () => {
    redis.zRangeByScore.mockResolvedValueOnce([]);
    const before = Date.now();
    await replyTokenQueue.pullFreshToken("Gabc");
    const after = Date.now();
    const [key, min, max] = redis.zRangeByScore.mock.calls[0];
    expect(key).toBe("REPLY_TOKEN_QUEUE_Gabc");
    expect(min).toBeGreaterThanOrEqual(before - 55000);
    expect(min).toBeLessThanOrEqual(after - 55000);
    expect(max).toBe("+inf");
  });

  it("returns null when sourceId is falsy", async () => {
    expect(await replyTokenQueue.pullFreshToken(null)).toBeNull();
    expect(await replyTokenQueue.pullFreshToken("")).toBeNull();
    expect(redis.zRangeByScore).not.toHaveBeenCalled();
  });
});
