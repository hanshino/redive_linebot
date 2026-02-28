const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/controller/princess/character", () => ({
  router: [],
  api: {
    getCharacterImages: jest.fn((req, res) => {
      res.json([
        { unitId: 100101, unitName: "Pecorine", fullImage: "full.png", headImage: "head.png" },
        { unitId: 100201, unitName: "Kokkoro", fullImage: "full.png", headImage: "head.png" },
      ]);
    }),
  },
}));

const PrincessCharacterController = require("../../src/controller/princess/character");

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/characters/images", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with an array of character images", async () => {
    const res = await request(app).get("/api/characters/images");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  it("returns character objects with expected fields", async () => {
    const res = await request(app).get("/api/characters/images");

    res.body.forEach(character => {
      expect(character).toHaveProperty("unitId");
      expect(character).toHaveProperty("unitName");
      expect(character).toHaveProperty("fullImage");
      expect(character).toHaveProperty("headImage");
    });
  });

  it("calls getCharacterImages handler", async () => {
    await request(app).get("/api/characters/images");

    expect(PrincessCharacterController.api.getCharacterImages).toHaveBeenCalledTimes(1);
  });
});
