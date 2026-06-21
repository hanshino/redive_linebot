// jest.mock is NOT hoisted in this repo (transform:{}) -> declare before requiring the SUT.
const mockKnex = {
  where: jest.fn().mockReturnThis(),
  update: jest.fn().mockResolvedValue(1),
  leftJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue({ equipment_id: 7, enhance_level: 3 }),
};
// mysql is called both as `mysql(table)` and as `mysql.fn.now()`.
// base.js also calls `mysql.transactionProvider()` at module load — mock it too.
const mockMysql = jest.fn(() => mockKnex);
mockMysql.fn = { now: jest.fn(() => "NOW()") };
mockMysql.transactionProvider = jest.fn(() => jest.fn());

jest.mock("../../../util/mysql", () => mockMysql);

const PlayerEquipment = require("../PlayerEquipment");

describe("PlayerEquipment enhance helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("setEnhanceLevel updates the matching owned row to the new level (no trx)", async () => {
    const updated = await PlayerEquipment.setEnhanceLevel("U123", 7, 4);
    expect(mockMysql).toHaveBeenCalledWith("player_equipment");
    expect(mockKnex.where).toHaveBeenCalledWith({ user_id: "U123", equipment_id: 7 });
    expect(mockKnex.update).toHaveBeenCalledWith(expect.objectContaining({ enhance_level: 4 }));
    expect(updated).toBe(1);
  });

  it("setEnhanceLevel uses the passed trx when provided", async () => {
    const trxKnex = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
    };
    const trx = jest.fn(() => trxKnex);
    await PlayerEquipment.setEnhanceLevel("U123", 7, 5, trx);
    expect(trx).toHaveBeenCalledWith("player_equipment");
    expect(trxKnex.update).toHaveBeenCalledWith(expect.objectContaining({ enhance_level: 5 }));
    // The default (non-trx) knex must NOT be touched for the update.
    expect(mockKnex.update).not.toHaveBeenCalled();
  });

  it("getWithEnhance returns the joined row including enhance_level", async () => {
    const row = await PlayerEquipment.getWithEnhance("U123", 7);
    expect(mockKnex.leftJoin).toHaveBeenCalledWith(
      "equipment",
      "player_equipment.equipment_id",
      "equipment.id"
    );
    expect(mockKnex.where).toHaveBeenCalledWith({
      "player_equipment.user_id": "U123",
      "player_equipment.equipment_id": 7,
    });
    expect(row).toEqual({ equipment_id: 7, enhance_level: 3 });
  });
});
