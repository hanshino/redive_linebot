const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/controller/application/AnnounceController", () => ({
  api: {
    queryData: jest.fn((req, res) => {
      res.json({ data: [], page: parseInt(req.params.page) });
    }),
  },
}));

const AnnounceController = require("../../src/controller/application/AnnounceController");

let app;
beforeAll(() => {
  app = createApp();
});

describe("GET /api/announcements/:page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 for page 1", async () => {
    const res = await request(app).get("/api/announcements/1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], page: 1 });
  });

  it("passes page param to the handler", async () => {
    const res = await request(app).get("/api/announcements/5");

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(5);
    expect(AnnounceController.api.queryData).toHaveBeenCalled();
  });

  it("calls queryData handler exactly once per request", async () => {
    await request(app).get("/api/announcements/3");

    expect(AnnounceController.api.queryData).toHaveBeenCalledTimes(1);
  });
});
