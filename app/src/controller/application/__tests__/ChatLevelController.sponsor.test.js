// mysql + bot mocks live in __tests__/setup.js (global setupFile).
jest.mock("../../../model/application/UserModel", () => ({ getId: jest.fn() }));
jest.mock("../../../model/application/Sponsorship", () => ({ sumAmountByUser: jest.fn() }));

const UserModel = require("../../../model/application/UserModel");
const Sponsorship = require("../../../model/application/Sponsorship");
const {
  _internal: { getSponsorAmount },
} = require("../ChatLevelController");

describe("ChatLevelController._internal.getSponsorAmount", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sums sponsorship by user.id and converts decimal string to number", async () => {
    UserModel.getId.mockResolvedValue(42);
    Sponsorship.sumAmountByUser.mockResolvedValue({ total: "1350.00" });
    await expect(getSponsorAmount("Uabc")).resolves.toBe(1350);
    expect(Sponsorship.sumAmountByUser).toHaveBeenCalledWith(42);
  });

  it("returns 0 when no sponsorship rows (SUM is null)", async () => {
    UserModel.getId.mockResolvedValue(42);
    Sponsorship.sumAmountByUser.mockResolvedValue({ total: null });
    await expect(getSponsorAmount("Uabc")).resolves.toBe(0);
  });

  it("returns 0 without querying when user row missing", async () => {
    UserModel.getId.mockResolvedValue(null);
    await expect(getSponsorAmount("Uabc")).resolves.toBe(0);
    expect(Sponsorship.sumAmountByUser).not.toHaveBeenCalled();
  });
});
