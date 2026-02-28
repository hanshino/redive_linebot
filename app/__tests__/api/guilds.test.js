const request = require("supertest");
const createApp = require("../helpers/createApp");

jest.mock("../../src/controller/application/Guild", () => ({
  api: {
    getGuildSummarys: jest.fn((req, res) => res.json({ guilds: [] })),
    getGuildSummary: jest.fn((req, res) => res.json({ guildId: req.params.guildId })),
  },
}));

jest.mock("../../src/controller/princess/battle", () => ({
  api: {
    showSigninList: jest.fn((req, res) => res.json({ month: req.params.month, list: [] })),
    getGuildBattleConfig: jest.fn((req, res) => res.json({ config: {} })),
    updateGuildBattleConfig: jest.fn((req, res) => res.json({ success: true })),
  },
  BattleList: jest.fn(),
  BattleSignUp: jest.fn(),
  SignMessageTest: jest.fn(),
  BattlePostSignUp: jest.fn(),
  BattleCancel: jest.fn(),
  BattlePostCancel: jest.fn(),
  CurrentBattle: jest.fn(),
  SetWeek: jest.fn(),
  NextBattleList: jest.fn(),
  PreBattleList: jest.fn(),
  IncWeek: jest.fn(),
  DecWeek: jest.fn(),
  FinishWeek: jest.fn(),
  reportFinish: jest.fn(),
  reportReset: jest.fn(),
  showSigninList: jest.fn(),
}));

const GuildController = require("../../src/controller/application/Guild");
const GuildBattleController = require("../../src/controller/princess/battle");

const guildId = "C" + "a".repeat(32);

let app;
beforeAll(() => {
  app = createApp();
});

describe("Guild API endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/guilds", () => {
    it("returns 200 with guild list", async () => {
      const res = await request(app).get("/api/guilds");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ guilds: [] });
      expect(GuildController.api.getGuildSummarys).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/guilds/:guildId", () => {
    it("returns 200 with guild summary", async () => {
      const res = await request(app).get(`/api/guilds/${guildId}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ guildId });
      expect(GuildController.api.getGuildSummary).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/guilds/:guildId/battle-signs/months/:month", () => {
    it("returns 200 with signin list", async () => {
      const res = await request(app).get(`/api/guilds/${guildId}/battle-signs/months/202601`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ month: "202601", list: [] });
      expect(GuildBattleController.api.showSigninList).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/guilds/:guildId/battle-config", () => {
    it("returns 200 with battle config", async () => {
      const res = await request(app).get(`/api/guilds/${guildId}/battle-config`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ config: {} });
      expect(GuildBattleController.api.getGuildBattleConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe("PUT /api/guilds/:guildId/battle-config", () => {
    it("returns 200 on success", async () => {
      const res = await request(app)
        .put(`/api/guilds/${guildId}/battle-config`)
        .send({ signMessage: "Updated" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(GuildBattleController.api.updateGuildBattleConfig).toHaveBeenCalledTimes(1);
    });
  });
});
