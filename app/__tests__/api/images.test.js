const request = require("supertest");
const createApp = require("../helpers/createApp");

let app;
beforeAll(() => {
  app = createApp();
});

describe("POST /api/images", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with link on successful upload", async () => {
    const res = await request(app).post("/api/images").send({ image: "base64imagedata" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      link: "https://i.imgur.com/test.jpg",
    });
  });
});
