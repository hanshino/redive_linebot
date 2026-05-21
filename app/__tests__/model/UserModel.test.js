const mysql = require("../../src/util/mysql");
const UserModel = require("../../src/model/application/UserModel");

jest.mock("../../src/util/mysql", () => ({
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn(),
}));

describe("UserModel.getProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql.select.mockReturnThis();
    mysql.from.mockReturnThis();
  });

  it("returns { displayName, pictureUrl } when row exists", async () => {
    mysql.where.mockResolvedValueOnce([{ display_name: "Alice", picture_url: "https://x/a.png" }]);

    const result = await UserModel.getProfile("Uabc");
    expect(result).toEqual({ displayName: "Alice", pictureUrl: "https://x/a.png" });
  });

  it("returns null when no row found", async () => {
    mysql.where.mockResolvedValueOnce([]);

    const result = await UserModel.getProfile("Uunknown");
    expect(result).toBeNull();
  });

  it("returns null when display_name is null in DB", async () => {
    mysql.where.mockResolvedValueOnce([{ display_name: null, picture_url: null }]);

    const result = await UserModel.getProfile("Ublank");
    expect(result).toBeNull();
  });
});
