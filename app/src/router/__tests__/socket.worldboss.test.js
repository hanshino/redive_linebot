// capture the connection handler registered on the /world-boss namespace
let worldBossConnectionHandler;
const makeNamespace = name => {
  const ns = {};
  ns.use = jest.fn(() => ns); // chainable
  ns.on = jest.fn((evt, cb) => {
    if (name === "/world-boss" && evt === "connection") worldBossConnectionHandler = cb;
    return ns;
  });
  return ns;
};
const namespaces = {};
const ofMock = jest.fn(name => {
  namespaces[name] = namespaces[name] || makeNamespace(name);
  return namespaces[name];
});

jest.mock("../../util/connection", () => ({
  io: { of: ofMock, on: jest.fn() },
}));
jest.mock("../../middleware/validation", () => ({
  socketSetProfile: jest.fn(),
  socketVerifyAdmin: jest.fn(),
}));
jest.mock("../../model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
}));
jest.mock("../../service/WorldBossBroadcastService", () => ({
  buildSnapshot: jest.fn(),
  roomName: jest.fn(id => `wb:${id}`),
}));

const { socketSetProfile } = require("../../middleware/validation");
const WorldBossEvent = require("../../model/application/WorldBossEvent");
const Broadcast = require("../../service/WorldBossBroadcastService");

describe("/world-boss socket namespace", () => {
  beforeAll(() => {
    require("../socket"); // registers all namespaces
  });

  it("registers /world-boss with socketSetProfile", () => {
    expect(ofMock).toHaveBeenCalledWith("/world-boss");
    expect(namespaces["/world-boss"].use).toHaveBeenCalledWith(socketSetProfile);
  });

  it("on connect joins the active event room and emits current snapshot", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 9 });
    Broadcast.buildSnapshot.mockResolvedValue({ eventId: 9, hpPct: 100 });

    const join = jest.fn();
    const emit = jest.fn();
    const socket = { join, emit, on: jest.fn() };

    await worldBossConnectionHandler(socket);

    expect(join).toHaveBeenCalledWith("wb:9");
    expect(Broadcast.buildSnapshot).toHaveBeenCalledWith(9);
    expect(emit).toHaveBeenCalledWith("snapshot", { eventId: 9, hpPct: 100 });
  });

  it("on connect with no active event emits nothing and does not join", async () => {
    WorldBossEvent.getActive.mockResolvedValue(null);
    const join = jest.fn();
    const emit = jest.fn();
    const socket = { join, emit, on: jest.fn() };

    await worldBossConnectionHandler(socket);

    expect(join).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
