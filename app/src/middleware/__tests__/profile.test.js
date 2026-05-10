jest.mock("../../util/redis", () => ({
  get: jest.fn(),
  set: jest.fn().mockResolvedValue("OK"),
}));
jest.mock("../../util/Logger", () => ({
  DefaultLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../util/line", () => ({
  getGroupSummary: jest.fn().mockResolvedValue({ groupName: "g" }),
  getGroupCount: jest.fn().mockResolvedValue({ count: 1 }),
}));
jest.mock("../../model/application/UserModel", () => ({
  ensureUser: jest.fn().mockResolvedValue(1),
  updateProfile: jest.fn().mockResolvedValue(),
}));

const redis = require("../../util/redis");
const profileMiddleware = require("../profile");
const { setLineProfile } = profileMiddleware._internal;

function makeContext({ userId = "Ualice", cachedDatas = {}, getUserProfile } = {}) {
  return {
    platform: "line",
    event: { source: { userId, type: "user" } },
    state: { userDatas: cachedDatas, groupDatas: {} },
    setState: jest.fn(function (patch) {
      this.state = { ...this.state, ...patch };
    }),
    getUserProfile: getUserProfile || jest.fn().mockResolvedValue({ userId, displayName: "Alice" }),
  };
}

describe("middleware/profile setLineProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  it("short-circuits when userDatas already has the user (in-session hit)", async () => {
    const ctx = makeContext({ cachedDatas: { Ualice: { displayName: "Alice" } } });

    await setLineProfile(ctx);

    expect(redis.get).not.toHaveBeenCalled();
    expect(ctx.getUserProfile).not.toHaveBeenCalled();
    expect(ctx.setState).not.toHaveBeenCalled();
  });

  it("uses redis cache profile:{userId} when present and skips LINE API", async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ userId: "Ualice", displayName: "Cached" }));
    const ctx = makeContext();

    await setLineProfile(ctx);

    expect(redis.get).toHaveBeenCalledWith("profile:Ualice");
    expect(ctx.getUserProfile).not.toHaveBeenCalled();
    expect(ctx.setState).toHaveBeenCalledWith({
      userDatas: { Ualice: { userId: "Ualice", displayName: "Cached" } },
    });
  });

  it("on redis miss, fetches via LINE API and writes profile:{userId} with EX 1800", async () => {
    redis.get.mockResolvedValueOnce(null);
    const ctx = makeContext();

    await setLineProfile(ctx);

    expect(ctx.getUserProfile).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      "profile:Ualice",
      JSON.stringify({ userId: "Ualice", displayName: "Alice" }),
      { EX: 1800 }
    );
  });

  it("times out the LINE API call and skips state update when fetch hangs past 200ms", async () => {
    redis.get.mockResolvedValueOnce(null);
    let pendingTimer;
    const ctx = makeContext({
      getUserProfile: jest.fn(
        () =>
          new Promise(resolve => {
            pendingTimer = setTimeout(() => resolve({ displayName: "Slow" }), 1000);
          })
      ),
    });

    try {
      await setLineProfile(ctx);

      expect(ctx.setState).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    } finally {
      if (pendingTimer) clearTimeout(pendingTimer);
    }
  });

  it("survives a redis.get failure by falling through to LINE API", async () => {
    redis.get.mockRejectedValueOnce(new Error("redis down"));
    const ctx = makeContext();

    await setLineProfile(ctx);

    expect(ctx.getUserProfile).toHaveBeenCalledTimes(1);
    expect(ctx.setState).toHaveBeenCalledWith({
      userDatas: { Ualice: { userId: "Ualice", displayName: "Alice" } },
    });
  });
});
