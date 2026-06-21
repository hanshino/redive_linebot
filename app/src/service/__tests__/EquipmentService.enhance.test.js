// jest.mock NOT hoisted (transform:{}) -> declare ALL mocks before requiring EquipmentService.
jest.mock("../../model/application/PlayerEquipment", () => ({
  getWithEnhance: jest.fn(),
  setEnhanceLevel: jest.fn().mockResolvedValue(1),
}));
jest.mock("../../model/application/Equipment", () => ({
  find: jest.fn(),
}));
jest.mock("../../util/redis", () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
}));
jest.mock("../WorldBossConfig", () => ({
  ENHANCEMENT_MATERIAL_ITEM_ID: 1001,
  getEnhanceMaxLevel: jest.fn(() => 10),
  getEnhanceCost: jest.fn(target => target * 8),
  getEnhancePerLevelPct: jest.fn(() => 0.05),
}));

// The in-trx re-sum is a chained query: trx("Inventory").sum(...).where(...).first().
// The spend is trx("Inventory").insert([...]).
// Both use the same trxBuilder object returned by trx("Inventory").
const sumChain = {
  sum: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
};
const insertChain = {
  insert: jest.fn().mockResolvedValue([1]),
};
// trx("Inventory") must satisfy BOTH the insert call and the sum chain.
const trxBuilder = Object.assign({}, insertChain, sumChain);
const trx = jest.fn(() => trxBuilder);

// mockMysql defined before jest.mock so the factory closure captures the same reference.
const mockMysql = jest.fn(() => ({}));
mockMysql.transaction = jest.fn(async cb => cb(trx));
mockMysql.transactionProvider = jest.fn(() => jest.fn());
jest.mock("../../util/mysql", () => mockMysql);

const PlayerEquipmentModel = require("../../model/application/PlayerEquipment");
const Inventory = require("../../model/application/Inventory");
const EquipmentService = require("../EquipmentService");

describe("EquipmentService.enhanceEquipment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    trxBuilder.insert.mockResolvedValue([1]);
    trxBuilder.sum.mockReturnThis();
    trxBuilder.where.mockReturnThis();
    // pre-check sum (no trx) goes through the model helper.
    Inventory.inventory.getUserOwnCountByItemId = jest.fn().mockResolvedValue({ amount: 100 });
    // default in-trx re-sum: plenty of material after the decrement.
    trxBuilder.first.mockResolvedValue({ amount: 92 });
  });

  it("rejects when the player does not own the equipment", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue(undefined);
    await expect(EquipmentService.enhanceEquipment("U1", 7)).rejects.toThrow("裝備不存在");
    expect(mockMysql.transaction).not.toHaveBeenCalled();
  });

  it("rejects when already at max level (+10)", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue({
      equipment_id: 7,
      enhance_level: 10,
    });
    await expect(EquipmentService.enhanceEquipment("U1", 7)).rejects.toThrow("已達強化上限");
    expect(mockMysql.transaction).not.toHaveBeenCalled();
  });

  it("rejects on pre-check insufficient materials and consumes nothing", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue({
      equipment_id: 7,
      enhance_level: 0,
    });
    // +0 -> +1 costs getEnhanceCost(1) = 8; owns only 5 (pre-check fails fast, no trx)
    Inventory.inventory.getUserOwnCountByItemId = jest.fn().mockResolvedValue({ amount: 5 });
    await expect(EquipmentService.enhanceEquipment("U1", 7)).rejects.toThrow("強化素材不足");
    expect(mockMysql.transaction).not.toHaveBeenCalled();
    expect(trxBuilder.insert).not.toHaveBeenCalled();
    expect(PlayerEquipmentModel.setEnhanceLevel).not.toHaveBeenCalled();
  });

  it("rolls back when the in-trx re-sum goes negative (concurrent double-spend guard)", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue({
      equipment_id: 7,
      enhance_level: 0,
    });
    // Pre-check sees enough (8), but the in-trx re-sum (a concurrent enhance already spent)
    // returns a negative post-decrement balance -> must throw + roll back.
    Inventory.inventory.getUserOwnCountByItemId = jest.fn().mockResolvedValue({ amount: 8 });
    trxBuilder.first.mockResolvedValue({ amount: -4 });
    await expect(EquipmentService.enhanceEquipment("U1", 7)).rejects.toThrow("強化素材不足");
    // the negative ledger insert WAS attempted (inside trx) but the trx throws -> rolls back
    expect(trxBuilder.insert).toHaveBeenCalled();
    expect(PlayerEquipmentModel.setEnhanceLevel).not.toHaveBeenCalled();
  });

  it("enhances +0 -> +1: decrements 8 materials and bumps level, in one trx", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue({
      equipment_id: 7,
      enhance_level: 0,
    });
    Inventory.inventory.getUserOwnCountByItemId = jest.fn().mockResolvedValue({ amount: 50 }); // pre-check
    trxBuilder.first.mockResolvedValue({ amount: 42 }); // in-trx re-sum (post-decrement)

    const result = await EquipmentService.enhanceEquipment("U1", 7);

    expect(result).toEqual({
      equipmentId: 7,
      fromLevel: 0,
      toLevel: 1,
      cost: 8,
      remainingMaterials: 42,
    });
    // material decrement is a NEGATIVE ledger insert (string, mirrors decreaseGodStone; addendum §13)
    expect(trxBuilder.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "U1",
        itemId: 1001,
        itemAmount: "-8",
        note: "world_boss_enhance",
      }),
    ]);
    // level set inside the same trx
    expect(PlayerEquipmentModel.setEnhanceLevel).toHaveBeenCalledWith("U1", 7, 1, trx);
    // cache invalidated so combat reads the new level (addendum §3)
    const redis = require("../../util/redis");
    expect(redis.del).toHaveBeenCalledWith("playerEquipment:U1");
  });

  it("cost scales with target level: +4 -> +5 costs getEnhanceCost(5)=40", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue({
      equipment_id: 7,
      enhance_level: 4,
    });
    Inventory.inventory.getUserOwnCountByItemId = jest.fn().mockResolvedValue({ amount: 100 }); // pre-check
    trxBuilder.first.mockResolvedValue({ amount: 60 }); // in-trx re-sum

    const result = await EquipmentService.enhanceEquipment("U1", 7);
    expect(result.cost).toBe(40);
    expect(result.toLevel).toBe(5);
    expect(trxBuilder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 1001, itemAmount: "-40" }),
    ]);
  });
});
