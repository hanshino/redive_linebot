const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/model/application/Admin", () => ({
  find: jest.fn(),
  getList: jest.fn().mockResolvedValue([]),
  isAdmin: jest.fn().mockResolvedValue(false),
  isAdminFromCache: jest.fn().mockResolvedValue(false),
}));

const AdminModel = require("../../src/model/application/Admin");

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/me", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns merged profile and admin data when admin is found", async () => {
    AdminModel.find.mockResolvedValue({ admin: true, privilege: 5, name: "TestAdmin" });

    const res = await request(app).get("/api/me").set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: "U" + "a".repeat(32),
      privilege: 5,
      admin: true,
      name: "TestAdmin",
    });
    expect(AdminModel.find).toHaveBeenCalledWith("U" + "a".repeat(32));
  });

  it("returns profile with empty object when admin is not found", async () => {
    AdminModel.find.mockResolvedValue(null);

    const res = await request(app).get("/api/me").set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: "U" + "a".repeat(32),
      privilege: 9,
    });
    expect(res.body.admin).toBeUndefined();
    expect(AdminModel.find).toHaveBeenCalledWith("U" + "a".repeat(32));
  });
});
