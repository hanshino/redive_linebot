const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/controller/application/WorldBossController", () => ({
  api: {
    createAttackMessage: jest.fn((req, res) => res.status(201).json({ id: 1 })),
    listAttackMessage: jest.fn((req, res) => res.json([])),
    getAttackMessage: jest.fn((req, res) => res.json({ id: req.params.id })),
    updateAttackMessage: jest.fn((req, res) => res.json({ success: true })),
    deleteAttackMessage: jest.fn((req, res) => res.json({ success: true })),
  },
  router: [],
  attackOnBoss: jest.fn(),
}));

const WorldBossController = require("../../src/controller/application/WorldBossController");

let app;
beforeAll(() => {
  app = createApp();
});

describe("World Boss Feature Messages API endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/game/world-boss/feature-messages", () => {
    it("returns 201 on success", async () => {
      const res = await request(app)
        .post("/api/game/world-boss/feature-messages")
        .send({ message: "Critical hit!" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 1 });
      expect(WorldBossController.api.createAttackMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/game/world-boss/feature-messages", () => {
    it("returns 200 with message list", async () => {
      const res = await request(app).get("/api/game/world-boss/feature-messages");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(WorldBossController.api.listAttackMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/game/world-boss/feature-messages/:id", () => {
    it("returns 200 with single message", async () => {
      const res = await request(app).get("/api/game/world-boss/feature-messages/5");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: "5" });
      expect(WorldBossController.api.getAttackMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("PUT /api/game/world-boss/feature-messages/:id", () => {
    it("returns 200 on success", async () => {
      const res = await request(app)
        .put("/api/game/world-boss/feature-messages/5")
        .send({ message: "Updated message" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(WorldBossController.api.updateAttackMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("DELETE /api/game/world-boss/feature-messages/:id", () => {
    it("returns 200 on success", async () => {
      const res = await request(app).delete("/api/game/world-boss/feature-messages/5");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(WorldBossController.api.deleteAttackMessage).toHaveBeenCalledTimes(1);
    });
  });
});
