// Relies on global setup.js mocks. config is the REAL package (not mocked),
// so a dangling config.get("worldboss.revoke_charm") at load WOULD throw here.
describe("WorldBossController module load (atomic config/route removal guard, D28)", () => {
  it("requires without throwing (no dangling config.get on removed keys)", () => {
    let controller;
    expect(() => {
      jest.isolateModules(() => {
        controller = require("../../src/controller/application/WorldBossController");
      });
    }).not.toThrow();
    expect(Array.isArray(controller.router)).toBe(true);
  });
});
