jest.mock("../../src/model/application/MarketDetail");
jest.mock("../../src/model/application/UserModel", () => ({
  getProfile: jest.fn(),
}));

const MarketController = require("../../src/handler/Market");
const MarketDetailModel = require("../../src/model/application/MarketDetail");
const UserModel = require("../../src/model/application/UserModel");

function makeRes() {
  return {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
}

describe("MarketController.show enrichment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("attaches seller_display_name / buyer_display_name / star", async () => {
    MarketDetailModel.getById.mockResolvedValue({
      id: 1,
      seller_id: "Useller",
      sell_target_list: ["Ubuyer"],
      price: 1000,
      item_id: 999,
      status: 0,
      name: "Pecorine",
      image: "img.png",
      star: 3,
    });
    UserModel.getProfile.mockImplementation(async userId => {
      if (userId === "Useller") return { displayName: "Alice", pictureUrl: null };
      if (userId === "Ubuyer") return { displayName: "Bob", pictureUrl: null };
      return null;
    });

    const req = { params: { id: "1" }, profile: { userId: "Ubuyer" } };
    const res = makeRes();

    await MarketController.show(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.seller_display_name).toBe("Alice");
    expect(payload.buyer_display_name).toBe("Bob");
    expect(payload.star).toBe(3);
  });

  it("falls back to User-XXXX when profile lookup returns null", async () => {
    MarketDetailModel.getById.mockResolvedValue({
      id: 2,
      seller_id: "Ulongseller12345",
      sell_target_list: ["Ulongbuyer67890"],
      price: 100,
      item_id: 999,
      status: 0,
      name: "x",
      image: "x",
      star: 1,
    });
    UserModel.getProfile.mockResolvedValue(null);

    const req = { params: { id: "2" }, profile: { userId: "Ulongbuyer67890" } };
    const res = makeRes();

    await MarketController.show(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.seller_display_name).toBe("User-2345");
    expect(payload.buyer_display_name).toBe("User-7890");
  });
});
