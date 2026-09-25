// Regression coverage for showGodStoneRank's name-batching change:
// previously it called lineClient.getUserProfile(userId) once per ranked
// row (N LINE calls per request). It must now resolve all names in a
// single UserModel.getDisplayNames(ids) call and preserve the JSON shape /
// order / 未知N fallback.
jest.mock("../../../model/application/Inventory", () => ({
  inventory: { getGodStoneRank: jest.fn() },
}));
jest.mock("../../../model/application/UserModel", () => ({
  getDisplayNames: jest.fn(),
}));

const { inventory } = require("../../../model/application/Inventory");
const UserModel = require("../../../model/application/UserModel");
const gacha = require("../gacha");

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const A = "U" + "a".repeat(32);
const B = "U" + "b".repeat(32);
const C = "U" + "c".repeat(32);

describe("gacha.api.showGodStoneRank", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves all displayNames via a single UserModel.getDisplayNames call, not per-row LINE lookups", async () => {
    inventory.getGodStoneRank.mockResolvedValue([
      { userId: A, amount: 300 },
      { userId: B, amount: 200 },
    ]);
    UserModel.getDisplayNames.mockResolvedValue(
      new Map([
        [A, "Alice"],
        [B, "Bob"],
      ])
    );

    const req = {};
    const res = createRes();
    await gacha.api.showGodStoneRank(req, res);

    expect(UserModel.getDisplayNames).toHaveBeenCalledTimes(1);
    expect(UserModel.getDisplayNames).toHaveBeenCalledWith([A, B]);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      { userId: A, amount: 300, displayName: "Alice" },
      { userId: B, amount: 200, displayName: "Bob" },
    ]);
  });

  it("falls back to 未知N (1-indexed) when the batch lookup has no name for a row", async () => {
    inventory.getGodStoneRank.mockResolvedValue([
      { userId: A, amount: 300 },
      { userId: C, amount: 100 },
    ]);
    // A has a name, C is missing entirely from the Map (never existed in `user` table).
    UserModel.getDisplayNames.mockResolvedValue(new Map([[A, "Alice"]]));

    const req = {};
    const res = createRes();
    await gacha.api.showGodStoneRank(req, res);

    expect(res.body).toEqual([
      { userId: A, amount: 300, displayName: "Alice" },
      { userId: C, amount: 100, displayName: "未知2" },
    ]);
  });

  it("falls back to 未知N when the resolved name is an empty string", async () => {
    inventory.getGodStoneRank.mockResolvedValue([{ userId: A, amount: 300 }]);
    UserModel.getDisplayNames.mockResolvedValue(new Map([[A, ""]]));

    const res = createRes();
    await gacha.api.showGodStoneRank({}, res);

    expect(res.body).toEqual([{ userId: A, amount: 300, displayName: "未知1" }]);
  });

  it("does not fail the request when a name is missing (degrades to fallback, no throw)", async () => {
    inventory.getGodStoneRank.mockResolvedValue([{ userId: A, amount: 300 }]);
    UserModel.getDisplayNames.mockResolvedValue(new Map());

    const res = createRes();
    await expect(gacha.api.showGodStoneRank({}, res)).resolves.toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ userId: A, amount: 300, displayName: "未知1" }]);
  });

  it("returns 400 and does not call getDisplayNames when the ranking query itself fails", async () => {
    inventory.getGodStoneRank.mockRejectedValue(new Error("db down"));

    const res = createRes();
    await gacha.api.showGodStoneRank({}, res);

    expect(UserModel.getDisplayNames).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it("never touches the LINE client (module no longer imports getClient)", async () => {
    const bottender = require("bottender");
    inventory.getGodStoneRank.mockResolvedValue([{ userId: A, amount: 300 }]);
    UserModel.getDisplayNames.mockResolvedValue(new Map([[A, "Alice"]]));

    await gacha.api.showGodStoneRank({}, createRes());

    // gacha.js no longer requires bottender's getClient at module scope
    // (removed alongside the per-row profile lookup); getClient must never
    // fire as a side effect of ranking requests.
    expect(bottender.getClient).not.toHaveBeenCalled();
  });
});
