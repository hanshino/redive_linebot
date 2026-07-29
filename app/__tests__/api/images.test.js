const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/util/pictshare", () => ({
  uploadBase64: jest.fn().mockResolvedValue({ url: "https://img.hanshino.dev/test.png" }),
}));

const pictshare = require("../../src/util/pictshare");

let app;
beforeAll(() => {
  app = createApp();
});

describe("POST /api/images", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 and uploads when caller has privilege >= 5 (default test mock)", async () => {
    const res = await request(app)
      .post("/api/images")
      .set("Authorization", "Bearer test-token")
      .send({ image: "aGVsbG8=" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, link: "https://img.hanshino.dev/test.png" });
    expect(pictshare.uploadBase64).toHaveBeenCalledWith("aGVsbG8=");
  });

  it("rejects when privilege is below the required level (5)", async () => {
    // Re-mock validation for this test only: simulate an authenticated but
    // under-privileged admin to prove the gate actually checks privilege,
    // not just presence of the middleware chain.
    jest.resetModules();
    jest.doMock("../../src/middleware/validation", () => {
      const actual = jest.requireActual("../../src/middleware/validation");
      return {
        ...actual,
        verifyToken: (req, _res, next) => {
          req.profile = { userId: "U" + "a".repeat(32) };
          next();
        },
        verifyAdmin: (req, _res, next) => {
          req.profile = { ...req.profile, privilege: 1 };
          next();
        },
      };
    });
    jest.doMock("../../src/util/pictshare", () => ({
      uploadBase64: jest.fn().mockResolvedValue({ url: "https://img.hanshino.dev/test.png" }),
    }));

    const isolatedCreateApp = require("../helpers/createApp");
    const isolatedApp = isolatedCreateApp();

    const res = await request(isolatedApp)
      .post("/api/images")
      .set("Authorization", "Bearer test-token")
      .send({ image: "aGVsbG8=" });

    expect(res.status).toBe(403);

    jest.dontMock("../../src/middleware/validation");
    jest.dontMock("../../src/util/pictshare");
    jest.resetModules();
  });
});
