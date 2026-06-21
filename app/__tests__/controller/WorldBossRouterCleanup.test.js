// Global setup.js mocks bottender/router's text as jest.fn(() => jest.fn()), recording calls.
// We rely solely on the global setup mocks here.
const { text } = require("bottender/router");

/**
 * Load the controller in isolation and return the flattened list of verb
 * strings/patterns passed to text() during THIS load (not stale/cached calls).
 */
function loadControllerVerbs() {
  let controller;
  text.mockClear(); // wipe any calls recorded by earlier requires in this worker
  jest.isolateModules(() => {
    controller = require("../../src/controller/application/WorldBossController");
  });
  const flat = text.mock.calls
    .map(call => call[0])
    .flat()
    .map(v => (v instanceof RegExp ? v.source : String(v)));
  return { controller, flat };
}

describe("WorldBossController — 夢幻回歸 removal (D28)", () => {
  it("registers no #夢幻回歸 route", () => {
    const { flat } = loadControllerVerbs();
    expect(flat.some(v => v.includes("夢幻回歸"))).toBe(false);
  });

  it("registers no revoke-charm incantation route", () => {
    const { flat } = loadControllerVerbs();
    // the incantation string starts with 隱匿於夜
    expect(flat.some(v => v.includes("隱匿於夜"))).toBe(false);
  });

  it("no longer exports revokeAttack / revokeCharm", () => {
    const { controller } = loadControllerVerbs();
    expect(controller.revokeAttack).toBeUndefined();
    expect(controller.revokeCharm).toBeUndefined();
  });

  it("POSITIVE CONTROL: still registers the surviving routes (攻擊 / 世界王 / 冒險小卡)", () => {
    const { flat } = loadControllerVerbs();
    // If this fails, the mock array is stale/empty and the negative assertions above are vacuous.
    expect(flat.length).toBeGreaterThan(0);
    expect(flat.some(v => v.includes("攻擊"))).toBe(true);
    expect(flat.some(v => v.includes("世界王") || v.includes("worldboss"))).toBe(true);
    expect(flat.some(v => v.includes("冒險小卡"))).toBe(true);
  });
});

module.exports = { loadControllerVerbs };

describe("WorldBossController — raw JSON dump commands retired (D26)", () => {
  it("registers no /allevent route", () => {
    const { flat } = loadControllerVerbs();
    expect(flat.some(v => v.includes("/allevent"))).toBe(false);
  });

  it("registers no /bosslist route", () => {
    const { flat } = loadControllerVerbs();
    expect(flat.some(v => v.includes("/bosslist"))).toBe(false);
  });

  it("no longer exports all / bosslist debug handlers", () => {
    const { controller } = loadControllerVerbs();
    expect(controller.all).toBeUndefined();
    expect(controller.bosslist).toBeUndefined();
  });

  it("POSITIVE CONTROL: /worldrank survives (it is fixed, not retired)", () => {
    const { flat } = loadControllerVerbs();
    expect(flat.some(v => v.includes("/worldrank"))).toBe(true);
  });
});
