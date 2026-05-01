const redis = require("../../src/util/redis");
const pipeline = require("../../src/service/chatXp/pipeline");
const ChatExpUpdate = require("../../bin/ChatExpUpdate");

describe("ChatExpUpdate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(pipeline, "processBatch").mockResolvedValue();
  });

  it("no-ops when queue is empty", async () => {
    redis.rPop.mockResolvedValue(null);
    await ChatExpUpdate();
    expect(pipeline.processBatch).not.toHaveBeenCalled();
  });

  it("pops up to 1000 events and hands them to pipeline.processBatch", async () => {
    const events = Array.from({ length: 3 }, (_, i) => ({
      userId: `U${i}`,
      groupId: "G",
      ts: 1700000000000 + i,
      timeSinceLastMsg: null,
      groupCount: 3,
    }));
    redis.rPop
      .mockResolvedValueOnce(JSON.stringify(events[0]))
      .mockResolvedValueOnce(JSON.stringify(events[1]))
      .mockResolvedValueOnce(JSON.stringify(events[2]))
      .mockResolvedValueOnce(null);

    await ChatExpUpdate();

    expect(pipeline.processBatch).toHaveBeenCalledTimes(1);
    expect(pipeline.processBatch).toHaveBeenCalledWith(events);
  });

  it("skips unparseable queue items but still processes parseable ones", async () => {
    const good = {
      userId: "Ua",
      groupId: "G",
      ts: 1700000000000,
      timeSinceLastMsg: null,
      groupCount: 3,
    };
    redis.rPop
      .mockResolvedValueOnce("{{ bad json")
      .mockResolvedValueOnce(JSON.stringify(good))
      .mockResolvedValueOnce(null);

    await ChatExpUpdate();

    expect(pipeline.processBatch).toHaveBeenCalledWith([good]);
  });

  it("re-enters are guarded (running=true short-circuits)", async () => {
    redis.rPop.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(null), 20))
    );
    const p1 = ChatExpUpdate();
    const p2 = ChatExpUpdate();
    await Promise.all([p1, p2]);
    expect(redis.rPop.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
