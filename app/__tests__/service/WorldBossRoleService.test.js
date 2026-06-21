// --- mocks MUST precede the require of the module under test (transform:{} = no hoist) ---
const mockRoleFind = jest.fn();
const mockRoleCreate = jest.fn();
const mockRoleUpdate = jest.fn();
jest.mock("../../src/model/application/WorldBossRole", () => ({
  find: (...a) => mockRoleFind(...a),
  create: (...a) => mockRoleCreate(...a),
  update: (...a) => mockRoleUpdate(...a),
}));

const mockGetRoleGearIds = jest.fn();
jest.mock("../../seeds/WorldBossBaseGearSeeder", () => ({
  ROLE_GEAR: {
    dps: [{ name: "d1" }, { name: "d2" }, { name: "d3" }],
    healer: [{ name: "h1" }, { name: "h2" }, { name: "h3" }],
    tank: [{ name: "t1" }, { name: "t2" }, { name: "t3" }],
  },
  getRoleGearIds: (...a) => mockGetRoleGearIds(...a),
}));

const mockAddToInventory = jest.fn();
const mockEquip = jest.fn();
jest.mock("../../src/service/EquipmentService", () => ({
  addToInventory: (...a) => mockAddToInventory(...a),
  equip: (...a) => mockEquip(...a),
}));

const mockDecreaseGodStone = jest.fn();
const mockGetUserMoney = jest.fn();
jest.mock("../../src/model/application/Inventory", () => ({
  inventory: {
    decreaseGodStone: (...a) => mockDecreaseGodStone(...a),
    getUserMoney: (...a) => mockGetUserMoney(...a),
  },
}));

jest.mock("config", () => ({
  get: key => {
    const table = { "worldboss.reselect_stone_cost": 5000 };
    return table[key];
  },
}));

// mysql: an opaque knex token passed into getRoleGearIds, PLUS a transaction() that runs the
// callback with a fake trx so we can assert the debit+update happen inside it.
const FAKE_TRX = { __isTrx: true };
const mockTransaction = jest.fn(async fn => fn(FAKE_TRX));
jest.mock("../../src/util/mysql", () => {
  const m = jest.fn(() => ({ __isQueryBuilder: true }));
  m.__isMysql = true;
  m.transaction = (...a) => mockTransaction(...a);
  return m;
});

// Logger is harmless but mock it to keep output clean.
jest.mock("../../src/util/Logger", () => ({ DefaultLogger: { debug: jest.fn() } }));

const mysql = require("../../src/util/mysql");
const service = require("../../src/service/WorldBossRoleService");

describe("WorldBossRoleService", () => {
  beforeEach(() => {
    mockRoleFind.mockReset();
    mockRoleCreate.mockReset();
    mockRoleUpdate.mockReset();
    mockGetRoleGearIds.mockReset();
    mockAddToInventory.mockReset();
    mockEquip.mockReset();
    mockDecreaseGodStone.mockReset();
    mockGetUserMoney.mockReset();
    mockTransaction.mockClear();
  });

  describe("getRole", () => {
    test("returns the stored role", async () => {
      mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 0 });
      await expect(service.getRole("U1")).resolves.toBe("tank");
    });

    test("legacy player with no row defaults to dps (D27, lazy)", async () => {
      mockRoleFind.mockResolvedValue(undefined);
      await expect(service.getRole("U1")).resolves.toBe("dps");
    });
  });

  describe("chooseRole", () => {
    test("rejects an invalid role without writing", async () => {
      await expect(service.chooseRole("U1", "ranger")).rejects.toThrow("無效的職業");
      expect(mockRoleCreate).not.toHaveBeenCalled();
    });

    test("first choice creates the row at reselect_count 0, grants AND auto-equips the gear set", async () => {
      mockRoleFind.mockResolvedValue(undefined);
      mockGetRoleGearIds.mockResolvedValue([21, 22, 23]);
      mockAddToInventory.mockResolvedValue({});
      mockEquip.mockResolvedValue({});
      mockRoleCreate.mockResolvedValue(1);

      const result = await service.chooseRole("U1", "healer");

      expect(mockRoleCreate).toHaveBeenCalledWith({
        user_id: "U1",
        role: "healer",
        reselect_count: 0,
      });
      // seeder receives the shared mysql knex callable
      expect(mockGetRoleGearIds).toHaveBeenCalledWith(mysql, "healer");
      expect(mockAddToInventory.mock.calls.map(c => c[1])).toEqual([21, 22, 23]);
      // each granted (not skipped) piece is auto-equipped
      expect(mockEquip.mock.calls.map(c => c[1])).toEqual([21, 22, 23]);
      expect(result).toEqual({ role: "healer", granted_gear: [21, 22, 23] });
    });

    test("already-owned gear is swallowed as an idempotent skip and not re-equipped", async () => {
      mockRoleFind.mockResolvedValue(undefined);
      mockGetRoleGearIds.mockResolvedValue([21, 22, 23]);
      mockRoleCreate.mockResolvedValue(1);
      mockAddToInventory
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("已擁有此裝備"))
        .mockResolvedValueOnce({});
      mockEquip.mockResolvedValue({});

      const result = await service.chooseRole("U1", "healer");

      expect(result.granted_gear).toEqual([21, 23]); // 22 skipped, not thrown
      expect(mockEquip.mock.calls.map(c => c[1])).toEqual([21, 23]); // only granted pieces equipped
    });

    test("a non-ownership equipment error propagates", async () => {
      mockRoleFind.mockResolvedValue(undefined);
      mockGetRoleGearIds.mockResolvedValue([99]);
      mockRoleCreate.mockResolvedValue(1);
      mockAddToInventory.mockRejectedValue(new Error("裝備不存在"));

      await expect(service.chooseRole("U1", "dps")).rejects.toThrow("裝備不存在");
    });

    test("choosing when a row already exists routes to reselect (no duplicate create)", async () => {
      mockRoleFind.mockResolvedValue({ user_id: "U1", role: "dps", reselect_count: 0 });
      mockRoleUpdate.mockResolvedValue(1);

      const result = await service.chooseRole("U1", "tank");

      expect(mockRoleCreate).not.toHaveBeenCalled();
      expect(mockRoleUpdate).toHaveBeenCalled();
      expect(result.role).toBe("tank");
      expect(result.granted_gear).toEqual([]);
    });
  });

  describe("reselectRole", () => {
    test("throws when no existing role row (D27: free reselect is the first CHANGE after a row exists)", async () => {
      mockRoleFind.mockResolvedValue(undefined);
      await expect(service.reselectRole("U1", "tank")).rejects.toThrow("尚未選擇職業");
    });

    test("rejects an invalid role", async () => {
      mockRoleFind.mockResolvedValue({ user_id: "U1", role: "dps", reselect_count: 0 });
      await expect(service.reselectRole("U1", "ranger")).rejects.toThrow("無效的職業");
    });

    test("first reselect is free, increments reselect_count to 1, no stone charge, no trx", async () => {
      mockRoleFind.mockResolvedValue({ user_id: "U1", role: "dps", reselect_count: 0 });
      mockRoleUpdate.mockResolvedValue(1);

      const result = await service.reselectRole("U1", "tank");

      expect(mockDecreaseGodStone).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled(); // free path is a plain update
      expect(mockRoleUpdate).toHaveBeenCalledWith("U1", { role: "tank", reselect_count: 1 });
      expect(result).toEqual({ role: "tank", free_used: true });
    });

    test("second reselect charges stones inside a transaction when affordable", async () => {
      mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 1 });
      mockGetUserMoney.mockResolvedValue({ amount: 6000 });
      mockRoleUpdate.mockResolvedValue(1);

      const result = await service.reselectRole("U1", "healer");

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      // debit passes the trx from mysql.transaction (negative ledger insert handled inside decreaseGodStone)
      expect(mockDecreaseGodStone).toHaveBeenCalledWith({
        userId: "U1",
        amount: 5000,
        note: "world_boss_role_reselect",
        trx: FAKE_TRX,
      });
      // role update happens inside the same trx (model toggles setTransaction internally)
      expect(mockRoleUpdate).toHaveBeenCalledWith(
        "U1",
        { role: "healer", reselect_count: 2 },
        { trx: FAKE_TRX }
      );
      expect(result).toEqual({ role: "healer", free_used: false });
    });

    test("paid reselect at EXACTLY the cost is allowed (boundary)", async () => {
      mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 1 });
      mockGetUserMoney.mockResolvedValue({ amount: 5000 });
      mockRoleUpdate.mockResolvedValue(1);

      const result = await service.reselectRole("U1", "healer");

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ role: "healer", free_used: false });
    });

    test("second reselect throws 女神石不足 when too poor; never opens a trx, never charges, never updates", async () => {
      mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 1 });
      mockGetUserMoney.mockResolvedValue({ amount: 100 });

      await expect(service.reselectRole("U1", "healer")).rejects.toThrow("女神石不足");
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockDecreaseGodStone).not.toHaveBeenCalled();
      expect(mockRoleUpdate).not.toHaveBeenCalled();
    });

    test("getUserMoney returning null amount is guarded as 0 (poor)", async () => {
      mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 1 });
      mockGetUserMoney.mockResolvedValue({ amount: null });

      await expect(service.reselectRole("U1", "healer")).rejects.toThrow("女神石不足");
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("if the role update throws inside the trx, the transaction rejects (debit rolls back)", async () => {
      mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 1 });
      mockGetUserMoney.mockResolvedValue({ amount: 6000 });
      mockDecreaseGodStone.mockResolvedValue([1]);
      mockRoleUpdate.mockRejectedValue(new Error("db down"));

      await expect(service.reselectRole("U1", "healer")).rejects.toThrow("db down");
      // both ran inside the SAME transaction call, so a real DB would roll the debit back
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockDecreaseGodStone).toHaveBeenCalledWith(expect.objectContaining({ trx: FAKE_TRX }));
      expect(mockRoleUpdate).toHaveBeenCalledWith(
        "U1",
        { role: "healer", reselect_count: 2 },
        { trx: FAKE_TRX }
      );
    });
  });
});
