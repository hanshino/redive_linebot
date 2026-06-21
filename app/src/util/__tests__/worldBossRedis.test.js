jest.mock("../redis", () => ({
  zAdd: jest.fn(),
  zPopMin: jest.fn(),
  zScore: jest.fn(),
  zRem: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  getDel: jest.fn(),
}));

const redis = require("../redis");
const wbRedis = require("../worldBossRedis");

describe("worldBossRedis (LOCK §C — eight platform_id-keyed helpers)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("exports EXACTLY the eight LOCK §C names and no forbidden aliases", () => {
    expect(Object.keys(wbRedis).sort()).toEqual(
      [
        "blockOwner",
        "blockSet",
        "poolAdd",
        "poolPopMin",
        "poolRemove",
        "poolScore",
        "shieldConsume",
        "shieldSet",
      ].sort()
    );
    [
      "addToPool",
      "popFromPool",
      "isKnockedDown",
      "getBlockOwner",
      "consumeShield",
      "openBlockWindow",
      "setShield",
    ].forEach(forbidden => expect(wbRedis[forbidden]).toBeUndefined());
  });

  test("poolAdd ZADDs the platform_id member with score=ts", async () => {
    await wbRedis.poolAdd(7, "U123", 1000);
    expect(redis.zAdd).toHaveBeenCalledWith("wb:pool:7", { score: 1000, value: "U123" });
  });

  test("poolPopMin ZPOPMIN count and returns member strings", async () => {
    redis.zPopMin.mockResolvedValue([
      { value: "U1", score: 1 },
      { value: "U2", score: 2 },
    ]);
    const popped = await wbRedis.poolPopMin(7, 2);
    expect(redis.zPopMin).toHaveBeenCalledWith("wb:pool:7", 2);
    expect(popped).toEqual(["U1", "U2"]);
  });

  test("poolPopMin normalizes a single (non-array) reply", async () => {
    redis.zPopMin.mockResolvedValue({ value: "U1", score: 1 });
    expect(await wbRedis.poolPopMin(7, 1)).toEqual(["U1"]);
  });

  test("poolPopMin returns [] on empty reply", async () => {
    redis.zPopMin.mockResolvedValue(null);
    expect(await wbRedis.poolPopMin(7, 3)).toEqual([]);
  });

  test("poolScore returns number or null", async () => {
    redis.zScore.mockResolvedValueOnce(500);
    expect(await wbRedis.poolScore(7, "U1")).toBe(500);
    redis.zScore.mockResolvedValueOnce(null);
    expect(await wbRedis.poolScore(7, "U2")).toBeNull();
  });

  test("poolRemove ZREMs the platform_id member", async () => {
    await wbRedis.poolRemove(7, "U1");
    expect(redis.zRem).toHaveBeenCalledWith("wb:pool:7", "U1");
  });

  test("shieldSet SETs target key to owner platform_id with EX ttl", async () => {
    await wbRedis.shieldSet(7, "Utarget", "Uowner", 600);
    expect(redis.set).toHaveBeenCalledWith("wb:shield:7:Utarget", "Uowner", { EX: 600 });
  });

  test("shieldConsume GETDELs and returns the owner platform_id or null", async () => {
    redis.getDel.mockResolvedValueOnce("Uowner");
    expect(await wbRedis.shieldConsume(7, "Utarget")).toBe("Uowner");
    expect(redis.getDel).toHaveBeenCalledWith("wb:shield:7:Utarget");
    redis.getDel.mockResolvedValueOnce(null);
    expect(await wbRedis.shieldConsume(7, "Uother")).toBeNull();
  });

  test("blockSet SETs the block key to owner platform_id with EX ttl", async () => {
    await wbRedis.blockSet(7, "Uowner", 60);
    expect(redis.set).toHaveBeenCalledWith("wb:block:7", "Uowner", { EX: 60 });
  });

  test("blockOwner GETs the block key, returning owner or null", async () => {
    redis.get.mockResolvedValueOnce("Uowner");
    expect(await wbRedis.blockOwner(7)).toBe("Uowner");
    redis.get.mockResolvedValueOnce(null);
    expect(await wbRedis.blockOwner(7)).toBeNull();
  });
});
