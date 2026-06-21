// jest.mock NOT hoisted (transform:{}) -> mock before requiring the controller.
jest.mock("../../../service/EquipmentService", () => ({
  enhanceEquipment: jest.fn(),
}));

const EquipmentService = require("../../../service/EquipmentService");
const { enhanceCmd } = require("../WorldBossController");

function makeContext(text) {
  return {
    event: { message: { text }, source: { userId: "U123" } },
    state: {},
    sendText: jest.fn(),
  };
}

describe("WorldBossController.enhanceCmd", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows a usage hint when no equipment id is supplied", async () => {
    const ctx = makeContext("#強化");
    await enhanceCmd(ctx);
    expect(EquipmentService.enhanceEquipment).not.toHaveBeenCalled();
    expect(ctx.sendText).toHaveBeenCalledWith(expect.stringContaining("請指定"));
  });

  it("calls enhanceEquipment with the platform id and parsed equipment id", async () => {
    EquipmentService.enhanceEquipment.mockResolvedValue({
      equipmentId: 7,
      fromLevel: 2,
      toLevel: 3,
      cost: 24,
      remainingMaterials: 100,
    });
    const ctx = makeContext("#強化 7");
    await enhanceCmd(ctx);
    expect(EquipmentService.enhanceEquipment).toHaveBeenCalledWith("U123", 7);
    expect(ctx.sendText).toHaveBeenCalledWith(expect.stringContaining("+3"));
  });

  it("surfaces the service rejection message to the player", async () => {
    EquipmentService.enhanceEquipment.mockRejectedValue(new Error("強化素材不足"));
    const ctx = makeContext("#強化 7");
    await enhanceCmd(ctx);
    expect(ctx.sendText).toHaveBeenCalledWith(expect.stringContaining("強化素材不足"));
  });
});
