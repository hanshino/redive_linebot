jest.mock("../../src/model/application/UserModel", () => ({
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
}));
jest.mock("bottender", () => ({ getClient: jest.fn() }));

const { getProfile } = require("../../src/handler/Profile");
const redis = require("../../src/util/redis");
const UserModel = require("../../src/model/application/UserModel");
const { getClient } = require("bottender");

function makeRes() {
  return {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
}

describe("Profile handler GET /:userId", () => {
  let lineClient;

  beforeEach(() => {
    jest.clearAllMocks();
    lineClient = { getUserProfile: jest.fn() };
    getClient.mockReturnValue(lineClient);
  });

  it("serves from redis cache when available", async () => {
    redis.get.mockResolvedValue(JSON.stringify({ displayName: "Alice", pictureUrl: "x" }));
    const req = { params: { userId: "Ualice" } };
    const res = makeRes();

    await getProfile(req, res);

    expect(redis.get).toHaveBeenCalledWith("profile:Ualice");
    expect(res.json).toHaveBeenCalledWith({
      userId: "Ualice",
      displayName: "Alice",
      pictureUrl: "x",
    });
    expect(UserModel.getProfile).not.toHaveBeenCalled();
    expect(lineClient.getUserProfile).not.toHaveBeenCalled();
  });

  it("falls through to UserModel when redis misses", async () => {
    redis.get.mockResolvedValue(null);
    UserModel.getProfile.mockResolvedValue({ displayName: "Bob", pictureUrl: "y" });
    const req = { params: { userId: "Ubob" } };
    const res = makeRes();

    await getProfile(req, res);

    expect(UserModel.getProfile).toHaveBeenCalledWith("Ubob");
    expect(redis.set).toHaveBeenCalledWith(
      "profile:Ubob",
      JSON.stringify({ displayName: "Bob", pictureUrl: "y" }),
      { EX: 1800 }
    );
    expect(res.json).toHaveBeenCalledWith({
      userId: "Ubob",
      displayName: "Bob",
      pictureUrl: "y",
    });
  });

  it("falls through to LINE API when both caches miss", async () => {
    redis.get.mockResolvedValue(null);
    UserModel.getProfile.mockResolvedValue(null);
    lineClient.getUserProfile.mockResolvedValue({
      displayName: "Carol",
      pictureUrl: "z",
    });
    const req = { params: { userId: "Ucarol" } };
    const res = makeRes();

    await getProfile(req, res);

    expect(lineClient.getUserProfile).toHaveBeenCalledWith("Ucarol");
    expect(redis.set).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      userId: "Ucarol",
      displayName: "Carol",
      pictureUrl: "z",
    });
  });

  it("returns fallback when LINE API also fails", async () => {
    redis.get.mockResolvedValue(null);
    UserModel.getProfile.mockResolvedValue(null);
    lineClient.getUserProfile.mockRejectedValue(new Error("LINE 404"));
    const req = { params: { userId: "Uxxxxabcd" } };
    const res = makeRes();

    await getProfile(req, res);

    expect(res.json).toHaveBeenCalledWith({
      userId: "Uxxxxabcd",
      displayName: "User-abcd",
      pictureUrl: null,
    });
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});
