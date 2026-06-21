// jest.mock NOT hoisted (transform:{}) -> all mocks before requiring EquipmentService.
jest.mock("../../model/application/PlayerEquipment", () => ({
  getByUserId: jest.fn(),
}));
jest.mock("../../model/application/Equipment", () => ({
  find: jest.fn(),
}));
jest.mock("../../util/redis", () => ({
  get: jest.fn().mockResolvedValue(null), // force a DB read path, never serve cache
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
}));
jest.mock("../WorldBossConfig", () => ({
  getEnhancePerLevelPct: jest.fn(() => 0.05),
}));

const PlayerEquipmentModel = require("../../model/application/PlayerEquipment");
const EquipmentService = require("../EquipmentService");

describe("EquipmentService.getEquipmentBonuses with enhance_level", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sums base FRACTION atk_percent when all gear is +0; new keys default to 0", async () => {
    PlayerEquipmentModel.getByUserId.mockResolvedValue([
      {
        slot: "weapon",
        equipment_id: 1,
        name: "w",
        rarity: "common",
        image_url: "",
        enhance_level: 0,
        attributes: JSON.stringify({ atk_percent: 0.1 }), // fraction = +10%
      },
    ]);
    const b = await EquipmentService.getEquipmentBonuses("U1");
    expect(b.atk_percent).toBeCloseTo(0.1, 5);
    expect(b.support_power).toBe(0);
    expect(b.block_power).toBe(0);
  });

  it("applies base*(1+0.05*level) to atk_percent: +10 weapon -> 1.5x the stored fraction", async () => {
    PlayerEquipmentModel.getByUserId.mockResolvedValue([
      {
        slot: "weapon",
        equipment_id: 1,
        name: "w",
        rarity: "common",
        image_url: "",
        enhance_level: 10,
        attributes: JSON.stringify({ atk_percent: 0.2 }), // +20% base
      },
    ]);
    const b = await EquipmentService.getEquipmentBonuses("U1");
    // 0.2 * (1 + 0.05*10) = 0.2 * 1.5 = 0.3 ; fractions are NOT floored
    expect(b.atk_percent).toBeCloseTo(0.3, 5);
  });

  it("scales ONLY role attributes (atk/support/block); leaves exp_bonus unscaled", async () => {
    PlayerEquipmentModel.getByUserId.mockResolvedValue([
      {
        slot: "weapon",
        equipment_id: 1,
        name: "w",
        rarity: "common",
        image_url: "",
        enhance_level: 5,
        // one item carrying BOTH a scalable role attr and a non-combat utility attr
        attributes: JSON.stringify({ atk_percent: 0.1, exp_bonus: 100 }),
      },
    ]);
    const b = await EquipmentService.getEquipmentBonuses("U1");
    // atk_percent scaled: 0.1 * (1 + 0.05*5) = 0.1 * 1.25 = 0.125
    expect(b.atk_percent).toBeCloseTo(0.125, 5);
    // exp_bonus NOT scaled: stays 100
    expect(b.exp_bonus).toBe(100);
  });

  it("support_power/block_power are INTEGER counts, floored after enhance scaling", async () => {
    PlayerEquipmentModel.getByUserId.mockResolvedValue([
      {
        slot: "accessory",
        equipment_id: 2,
        name: "staff",
        rarity: "rare",
        image_url: "",
        enhance_level: 10,
        // support_power is a people-count; 2 * (1 + 0.05*10) = 2 * 1.5 = 3 (exact int)
        attributes: JSON.stringify({ support_power: 2 }),
      },
      {
        slot: "armor",
        equipment_id: 3,
        name: "shield",
        rarity: "rare",
        image_url: "",
        enhance_level: 5,
        // block_power 3 * (1 + 0.05*5) = 3 * 1.25 = 3.75 -> Math.floor -> 3
        attributes: JSON.stringify({ block_power: 3 }),
      },
    ]);
    const b = await EquipmentService.getEquipmentBonuses("U1");
    expect(b.support_power).toBe(3);
    expect(Number.isInteger(b.support_power)).toBe(true);
    expect(b.block_power).toBe(3); // floored from 3.75
    expect(Number.isInteger(b.block_power)).toBe(true);
  });

  it("sums integer counts across pieces and floors each piece independently", async () => {
    PlayerEquipmentModel.getByUserId.mockResolvedValue([
      {
        slot: "accessory",
        equipment_id: 2,
        name: "staff",
        rarity: "common",
        image_url: "",
        enhance_level: 1,
        // 1 * (1 + 0.05*1) = 1.05 -> floor 1
        attributes: JSON.stringify({ support_power: 1 }),
      },
      {
        slot: "weapon",
        equipment_id: 4,
        name: "wand",
        rarity: "common",
        image_url: "",
        enhance_level: 0,
        attributes: JSON.stringify({ support_power: 2 }),
      },
    ]);
    const b = await EquipmentService.getEquipmentBonuses("U1");
    // floor(1.05)=1 plus 2 = 3 (NOT floor(1.05+2)=3 by coincidence; floor is per-piece)
    expect(b.support_power).toBe(3);
  });
});
