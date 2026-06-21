jest.mock("../../../handler/WorldBoss", () => ({
  admin: {
    getAllWorldBoss: jest.fn(),
    getWorldBossById: jest.fn(),
    storeWorldBoss: jest.fn(),
    updateWorldBoss: jest.fn(),
    deleteWorldBoss: jest.fn(),
  },
  player: {
    getSnapshot: jest.fn(),
    getMe: jest.fn(),
    attack: jest.fn(),
    block: jest.fn(),
    revive: jest.fn(),
    shield: jest.fn(),
    role: jest.fn(),
    enhance: jest.fn(),
    getReport: jest.fn(),
  },
}));

const { player: playerRouter } = require("../index");

function routesOf(router) {
  return router.stack
    .filter(l => l.route)
    .map(l => ({
      path: l.route.path,
      methods: Object.keys(l.route.methods).filter(m => l.route.methods[m]),
    }));
}

describe("WorldBoss player router", () => {
  it("registers the nine player routes under /world-boss", () => {
    const routes = routesOf(playerRouter);
    const byPath = (p, m) => routes.some(r => r.path === p && r.methods.includes(m));
    expect(byPath("/world-boss/snapshot", "get")).toBe(true);
    expect(byPath("/world-boss/me", "get")).toBe(true);
    expect(byPath("/world-boss/attack", "post")).toBe(true);
    expect(byPath("/world-boss/block", "post")).toBe(true);
    expect(byPath("/world-boss/revive", "post")).toBe(true);
    expect(byPath("/world-boss/shield", "post")).toBe(true);
    expect(byPath("/world-boss/role", "post")).toBe(true);
    expect(byPath("/world-boss/enhance", "post")).toBe(true);
    expect(byPath("/world-boss/report", "get")).toBe(true);
  });
});
