jest.mock("../../../service/WorldBossCombatService", () => ({
  dpsAttack: jest.fn(),
  tankBlock: jest.fn(),
  healerRevive: jest.fn(),
  healerShield: jest.fn(),
}));
jest.mock("../../../service/WorldBossBroadcastService", () => ({
  buildSnapshot: jest.fn(),
  requestBroadcast: jest.fn(),
  emitEnrage: jest.fn(),
}));
jest.mock("../../../service/WorldBossReportService", () => ({
  getUnreadReport: jest.fn(),
  markDelivered: jest.fn(),
}));
jest.mock("../../../service/WorldBossRoleService", () => ({
  getRole: jest.fn(),
  chooseRole: jest.fn(),
  reselectRole: jest.fn(),
}));
jest.mock("../../../service/EquipmentService", () => ({
  enhanceEquipment: jest.fn(),
}));
jest.mock("../../../service/MinigameService", () => ({
  findByUserId: jest.fn(),
}));
jest.mock("../../../model/application/UserModel", () => ({
  getId: jest.fn(),
}));
jest.mock("../../../model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
}));

const Combat = require("../../../service/WorldBossCombatService");
const Broadcast = require("../../../service/WorldBossBroadcastService");
const Report = require("../../../service/WorldBossReportService");
const RoleService = require("../../../service/WorldBossRoleService");
const MinigameService = require("../../../service/MinigameService");
const EquipmentService = require("../../../service/EquipmentService");
const UserModel = require("../../../model/application/UserModel");
const WorldBossEvent = require("../../../model/application/WorldBossEvent");
const handler = require("../player");

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("WorldBoss player handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WorldBossEvent.getActive.mockResolvedValue({ id: 9, hp: 1000, speed: 35 });
    // deliberately DIFFERENT values: user.id=555 (correct FK) vs minigame_level.id=123 (wrong)
    UserModel.getId.mockResolvedValue(555);
    MinigameService.findByUserId.mockResolvedValue({ id: 123, level: 40 });
    RoleService.getRole.mockResolvedValue("dps");
  });

  it("getSnapshot returns the broadcast snapshot", async () => {
    Broadcast.buildSnapshot.mockResolvedValue({ eventId: 9, hpPct: 60 });
    const req = { profile: { userId: "Ualice" } };
    const res = mockRes();
    await handler.getSnapshot(req, res);
    expect(Broadcast.buildSnapshot).toHaveBeenCalledWith(9);
    expect(res.json).toHaveBeenCalledWith({ eventId: 9, hpPct: 60 });
  });

  it("getSnapshot returns active:false when no active boss", async () => {
    WorldBossEvent.getActive.mockResolvedValue(null);
    const req = { profile: { userId: "Ualice" } };
    const res = mockRes();
    await handler.getSnapshot(req, res);
    expect(res.json).toHaveBeenCalledWith({ active: false });
  });

  it("getMe returns role + numericUserId(user.id) + level(minigame)", async () => {
    const req = { profile: { userId: "Ualice" } };
    const res = mockRes();
    await handler.getMe(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ role: "dps", numericUserId: 555, level: 40 })
    );
  });

  it("REGRESSION: attack passes numericUserId from UserModel.getId (user.id=555), NOT minigame.id", async () => {
    Combat.dpsAttack.mockResolvedValue({
      damage: 200,
      contribution: 200,
      enraged: false,
      didEnrageTrigger: false,
      knockedBatch: [],
      selfKnocked: false,
      rejected: false,
    });
    const req = { profile: { userId: "Ualice" }, body: { attackType: "normal" } };
    const res = mockRes();
    await handler.attack(req, res);
    expect(UserModel.getId).toHaveBeenCalledWith("Ualice");
    expect(Combat.dpsAttack).toHaveBeenCalledWith({
      platformId: "Ualice",
      numericUserId: 555, // user.id — NOT 123 (minigame_level.id)
      eventId: 9,
      attackType: "normal",
      level: 40,
    });
    expect(Broadcast.requestBroadcast).toHaveBeenCalledWith(9);
    expect(Broadcast.emitEnrage).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ damage: 200 }));
  });

  it("attack emits enrage one-shot (platformId batch) when combat reports a trigger", async () => {
    Combat.dpsAttack.mockResolvedValue({
      damage: 200,
      contribution: 400,
      enraged: true,
      didEnrageTrigger: true,
      knockedBatch: ["Ub", "Uc"],
      selfKnocked: false,
      rejected: false,
    });
    const req = { profile: { userId: "Ualice" }, body: {} };
    const res = mockRes();
    await handler.attack(req, res);
    expect(Broadcast.emitEnrage).toHaveBeenCalledWith(9, ["Ub", "Uc"]);
  });

  it("attack returns 409 when combat rejects (knocked_down) and does NOT broadcast", async () => {
    Combat.dpsAttack.mockResolvedValue({ rejected: true, reason: "knocked_down" });
    const req = { profile: { userId: "Ualice" }, body: {} };
    const res = mockRes();
    await handler.attack(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ rejected: true, reason: "knocked_down" });
    expect(Broadcast.requestBroadcast).not.toHaveBeenCalled();
  });

  it("attack returns 409 no_user when UserModel.getId is null (no bad FK written)", async () => {
    UserModel.getId.mockResolvedValue(null);
    const req = { profile: { userId: "Ughost" }, body: {} };
    const res = mockRes();
    await handler.attack(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ rejected: true, reason: "no_user" });
    expect(Combat.dpsAttack).not.toHaveBeenCalled();
  });

  it("block/revive/shield resolve numericUserId via UserModel.getId too", async () => {
    Combat.tankBlock.mockResolvedValue({ rejected: false, windowMinutes: 5 });
    Combat.healerRevive.mockResolvedValue({ rejected: false, revived: [], contribution: 0 });
    Combat.healerShield.mockResolvedValue({ rejected: false, shielded: [] });
    const req = { profile: { userId: "Ualice" }, body: {} };
    await handler.block(req, mockRes());
    await handler.revive(req, mockRes());
    await handler.shield(req, mockRes());
    expect(Combat.tankBlock).toHaveBeenCalledWith({
      platformId: "Ualice",
      numericUserId: 555,
      eventId: 9,
    });
    expect(Combat.healerRevive).toHaveBeenCalledWith({
      platformId: "Ualice",
      numericUserId: 555,
      eventId: 9,
    });
    expect(Combat.healerShield).toHaveBeenCalledWith({
      platformId: "Ualice",
      numericUserId: 555,
      eventId: 9,
    });
  });

  it("getReport clears the unread flag only after returning a card", async () => {
    Report.getUnreadReport.mockResolvedValue({
      hasReport: true,
      reward: { materials: 10 },
      card: { type: "bubble" },
    });
    const req = { profile: { userId: "Ualice" } };
    const res = mockRes();
    await handler.getReport(req, res);
    expect(res.json).toHaveBeenCalledWith({
      hasReport: true,
      reward: { materials: 10 },
      card: { type: "bubble" },
    });
    expect(Report.markDelivered).toHaveBeenCalledWith("Ualice");
  });

  it("getReport does not clear the flag when there is no report", async () => {
    Report.getUnreadReport.mockResolvedValue({ hasReport: false, reward: null, card: null });
    const req = { profile: { userId: "Ualice" } };
    const res = mockRes();
    await handler.getReport(req, res);
    expect(Report.markDelivered).not.toHaveBeenCalled();
  });

  it("role with reselect=true calls reselectRole", async () => {
    RoleService.reselectRole.mockResolvedValue({ role: "tank", free_used: true });
    const req = { profile: { userId: "Ualice" }, body: { role: "tank", reselect: true } };
    const res = mockRes();
    await handler.role(req, res);
    expect(RoleService.reselectRole).toHaveBeenCalledWith("Ualice", "tank");
    expect(res.json).toHaveBeenCalledWith({ role: "tank", free_used: true });
  });

  it("enhance forwards to EquipmentService.enhanceEquipment", async () => {
    EquipmentService.enhanceEquipment.mockResolvedValue({ enhance_level: 3 });
    const req = { profile: { userId: "Ualice" }, body: { equipment_id: 55 } };
    const res = mockRes();
    await handler.enhance(req, res);
    expect(EquipmentService.enhanceEquipment).toHaveBeenCalledWith("Ualice", 55);
    expect(res.json).toHaveBeenCalledWith({ enhance_level: 3 });
  });
});
