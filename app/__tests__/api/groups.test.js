const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/controller/application/GroupRecord", () => ({
  getRankDatas: jest.fn((req, res) => res.json({ groupId: req.params.groupId, ranks: [] })),
}));

jest.mock("../../src/controller/application/GroupConfig", () => ({
  api: {
    setSender: jest.fn((req, res) => res.json({ success: true })),
    switchConfig: jest.fn((req, res) =>
      res.json({ name: req.params.name, status: req.params.status })
    ),
    setDiscordWebhook: jest.fn((req, res) => res.json({ success: true })),
    setWelcomeMessage: jest.fn((req, res) => res.json({ success: true })),
    removeDiscordWebhook: jest.fn((req, res) => res.json({ success: true })),
    fetchConfig: jest.fn((req, res) => res.json({ config: {} })),
  },
  setSender: jest.fn(),
  switchConfig: jest.fn(),
}));

const GroupRecordController = require("../../src/controller/application/GroupRecord");
const GroupConfigController = require("../../src/controller/application/GroupConfig");

const groupId = "C" + "a".repeat(32);

let app;
beforeAll(() => {
  app = createApp();
});

describe("Group API endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/groups/:groupId/speak-rank", () => {
    it("returns 200 with rank data", async () => {
      const res = await request(app).get(`/api/groups/${groupId}/speak-rank`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ groupId, ranks: [] });
      expect(GroupRecordController.getRankDatas).toHaveBeenCalledTimes(1);
    });
  });

  describe("PUT /api/groups/:groupId/sender", () => {
    it("returns 200 on success", async () => {
      const res = await request(app).put(`/api/groups/${groupId}/sender`).send({ sender: "test" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(GroupConfigController.api.setSender).toHaveBeenCalledTimes(1);
    });
  });

  describe("PUT /api/groups/:groupId/features/:name/:status", () => {
    it("returns 200 with feature name and status", async () => {
      const res = await request(app).put(`/api/groups/${groupId}/features/Gacha/1`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ name: "Gacha", status: "1" });
      expect(GroupConfigController.api.switchConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/groups/:groupId/discord-webhook", () => {
    it("returns 200 on success", async () => {
      const res = await request(app)
        .post(`/api/groups/${groupId}/discord-webhook`)
        .send({ webhook: "https://discord.com/api/webhooks/test" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(GroupConfigController.api.setDiscordWebhook).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/groups/:groupId/welcome-message", () => {
    it("returns 200 on success", async () => {
      const res = await request(app)
        .post(`/api/groups/${groupId}/welcome-message`)
        .send({ message: "Welcome!" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(GroupConfigController.api.setWelcomeMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("DELETE /api/groups/:groupId/discord-webhook", () => {
    it("returns 200 on success", async () => {
      const res = await request(app).delete(`/api/groups/${groupId}/discord-webhook`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(GroupConfigController.api.removeDiscordWebhook).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/groups/:groupId/config", () => {
    it("returns 200 with config", async () => {
      const res = await request(app).get(`/api/groups/${groupId}/config`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ config: {} });
      expect(GroupConfigController.api.fetchConfig).toHaveBeenCalledTimes(1);
    });
  });
});
