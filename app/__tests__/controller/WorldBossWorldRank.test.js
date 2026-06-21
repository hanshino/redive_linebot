// jest.mock is NOT hoisted (transform:{}) — every mock BEFORE requires.
// Global setup.js already mocks mysql/redis/i18n/bottender/router/Logger/connection.
// We override the bottender mock here to include getUserProfile on a singleton client
// so the controller (which calls getClient("line") at module load) gets the same object.

const mockLineClient = {
  getGroupMemberProfile: jest.fn().mockResolvedValue({ displayName: "TestUser" }),
  getProfile: jest.fn().mockResolvedValue({ displayName: "TestUser", userId: "Utest" }),
  getUserProfile: jest.fn(),
  pushMessage: jest.fn().mockResolvedValue({}),
  replyMessage: jest.fn().mockResolvedValue({}),
  reply: jest.fn().mockResolvedValue({}),
  getGroupMembersCount: jest.fn().mockResolvedValue(0),
  getGroupMemberIds: jest.fn().mockResolvedValue([]),
};

jest.mock("bottender", () => ({
  getClient: jest.fn(() => mockLineClient),
  chain: jest.fn((...fns) => fns),
  withProps: jest.fn(fn => fn),
  Context: jest.fn(),
  LineContext: jest.fn(),
}));

jest.mock("../../src/service/WorldBossEventService", () => ({
  getCurrentEvent: jest.fn(),
}));

// The controller imports the MODEL as { model: worldBossLogModel } from WorldBossLog.
// Mock the model's getDamageRank (the locked access path; same as M8).
// Real getDamageRank returns rows shaped { user_id, platform_id, total_damage }.
jest.mock("../../src/model/application/WorldBossLog", () => ({
  model: {
    getDamageRank: jest.fn(),
    // intentionally NO getTopTen — if the controller still calls it, it throws.
  },
}));

jest.mock("../../src/templates/application/WorldBoss", () => ({
  generateRankBox: jest.fn(args => ({ box: args })),
  generateTopTenRank: jest.fn(boxes => ({ type: "bubble", boxes })),
}));

const worldBossEventService = require("../../src/service/WorldBossEventService");
const { model: worldBossLogModel } = require("../../src/model/application/WorldBossLog");
const worldBossTemplate = require("../../src/templates/application/WorldBoss");

let controller;
jest.isolateModules(() => {
  controller = require("../../src/controller/application/WorldBossController");
});

function makeContext() {
  return {
    event: { source: { type: "group" } },
    replyText: jest.fn(),
    replyFlex: jest.fn(),
  };
}

describe("WorldBossController.worldRank (/worldrank fix, D26)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("replies a Flex ranking (never replyText) using getDamageRank with platform_id", async () => {
    worldBossEventService.getCurrentEvent.mockResolvedValue([{ id: 42 }]);
    // Real getDamageRank row shape: { user_id, platform_id, total_damage }
    worldBossLogModel.getDamageRank.mockResolvedValue([
      { total_damage: 5000, user_id: 1, platform_id: "Uaaa" },
      { total_damage: 3000, user_id: 2, platform_id: "Ubbb" },
    ]);
    mockLineClient.getUserProfile.mockResolvedValue({ displayName: "Tester" });

    const context = makeContext();
    await controller.worldRank(context);

    // MODEL access path, correct args
    expect(worldBossLogModel.getDamageRank).toHaveBeenCalledWith({ eventId: 42, limit: 10 });
    // profile lookup keyed on the LINE platform_id field (real getDamageRank shape)
    expect(mockLineClient.getUserProfile).toHaveBeenCalledWith("Uaaa");
    expect(mockLineClient.getUserProfile).toHaveBeenCalledWith("Ubbb");
    // one rank box per ranked player
    expect(worldBossTemplate.generateRankBox).toHaveBeenCalledTimes(2);
    // replies Flex, and NEVER dumps to replyText on the success path
    expect(context.replyFlex).toHaveBeenCalledTimes(1);
    expect(context.replyText).toHaveBeenCalledTimes(0);
  });

  it("falls back to 路人N when a profile lookup fails (does not crash the whole reply)", async () => {
    worldBossEventService.getCurrentEvent.mockResolvedValue([{ id: 7 }]);
    worldBossLogModel.getDamageRank.mockResolvedValue([
      { total_damage: 100, user_id: 9, platform_id: "Uzzz" },
    ]);
    mockLineClient.getUserProfile.mockRejectedValue(new Error("not in group"));

    const context = makeContext();
    await controller.worldRank(context);

    expect(context.replyFlex).toHaveBeenCalledTimes(1);
    expect(worldBossTemplate.generateRankBox).toHaveBeenCalledWith(
      expect.objectContaining({ name: "路人1", damage: 100, rank: 1 })
    );
  });

  it("replies a plain message when no event is ongoing", async () => {
    worldBossEventService.getCurrentEvent.mockResolvedValue([]);
    const context = makeContext();
    await controller.worldRank(context);
    expect(worldBossLogModel.getDamageRank).not.toHaveBeenCalled();
    expect(context.replyText).toHaveBeenCalledTimes(1);
    expect(context.replyFlex).not.toHaveBeenCalled();
  });

  it("replies a plain message when multiple events are ongoing", async () => {
    worldBossEventService.getCurrentEvent.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const context = makeContext();
    await controller.worldRank(context);
    expect(worldBossLogModel.getDamageRank).not.toHaveBeenCalled();
    expect(context.replyText).toHaveBeenCalledTimes(1);
    expect(context.replyFlex).not.toHaveBeenCalled();
  });
});
