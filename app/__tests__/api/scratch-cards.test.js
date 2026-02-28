const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/controller/application/ScratchCardController", () => ({
  api: {
    list: jest.fn((req, res) => res.json([])),
    showMyCards: jest.fn((req, res) => res.json({ cards: [] })),
    myCardsCount: jest.fn((req, res) => res.json({ count: 0 })),
    exchange: jest.fn((req, res) => res.json({ success: true })),
    show: jest.fn((req, res) => res.json({ id: req.params.id })),
    purchase: jest.fn((req, res) => res.json({ success: true })),
    generateCards: jest.fn((req, res) => res.status(201).json({ success: true })),
  },
  router: [],
  exchange: jest.fn(),
}));

const ScratchCardController = require("../../src/controller/application/ScratchCardController");

let app;
beforeAll(() => {
  app = createApp();
});

describe("ScratchCard API endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/scratch-cards/", () => {
    it("returns 200 with card list", async () => {
      const res = await request(app).get("/api/scratch-cards/");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(ScratchCardController.api.list).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/scratch-cards/my-cards", () => {
    it("returns 200 with user cards", async () => {
      const res = await request(app).get("/api/scratch-cards/my-cards");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ cards: [] });
      expect(ScratchCardController.api.showMyCards).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/scratch-cards/my-cards/count", () => {
    it("returns 200 with card count", async () => {
      const res = await request(app).get("/api/scratch-cards/my-cards/count");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ count: 0 });
      expect(ScratchCardController.api.myCardsCount).toHaveBeenCalledTimes(1);
    });
  });

  describe("PUT /api/scratch-cards/exchange", () => {
    it("returns 200 on success", async () => {
      const res = await request(app)
        .put("/api/scratch-cards/exchange")
        .send({ cardId: 1 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(ScratchCardController.api.exchange).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/scratch-cards/:id", () => {
    it("returns 200 with card details", async () => {
      const res = await request(app).get("/api/scratch-cards/42");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: "42" });
      expect(ScratchCardController.api.show).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/scratch-cards/:id/purchase", () => {
    it("returns 200 on success", async () => {
      const res = await request(app).post("/api/scratch-cards/42/purchase");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(ScratchCardController.api.purchase).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/scratch-cards/generate", () => {
    it("returns 201 on success", async () => {
      const res = await request(app)
        .post("/api/scratch-cards/generate")
        .send({ id: 1, data: { count: 10 } });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true });
      expect(ScratchCardController.api.generateCards).toHaveBeenCalledTimes(1);
    });
  });
});
