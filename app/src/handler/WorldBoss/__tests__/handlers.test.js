jest.mock("../../../service/WorldBossCatalogService", () => ({
  listBosses: jest.fn(),
  createBoss: jest.fn(),
  updateBoss: jest.fn(),
  deleteBoss: jest.fn(),
}));
jest.mock("../../../service/WorldBossSeasonService", () => ({
  listSeasons: jest.fn(),
  createSeason: jest.fn(),
  updateSeason: jest.fn(),
  deleteSeason: jest.fn(),
  openSeason: jest.fn(),
  getBattleStatus: jest.fn(),
  getRanking: jest.fn(),
  getUserTotalDamage: jest.fn(),
  getLatestSettledResult: jest.fn(),
}));
jest.mock("../../../service/WorldBossBattleService", () => ({
  getRemainingDailyCost: jest.fn(),
}));
const CatalogService = require("../../../service/WorldBossCatalogService");
const SeasonService = require("../../../service/WorldBossSeasonService");
const BattleService = require("../../../service/WorldBossBattleService");
const express = require("express");
const supertest = require("supertest");
const admin = require("../admin");
const publicHandler = require("../public");

function response() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

function request({ body = {}, params = {}, query = {}, userId = "Uworldboss" } = {}) {
  return { body, params, query, profile: { userId } };
}

function error(code) {
  return Object.assign(new Error(code), { code });
}

const bossRows = [
  {
    id: 1,
    name: "炎龍",
    hp_weight: "1.25",
    created_at: new Date("2026-07-19T01:02:03.000Z"),
    updated_at: new Date("2026-07-19T04:05:06.000Z"),
  },
  { id: 2, name: "冰狼", hp_weight: "0.75" },
];
const seasonRows = [
  {
    id: 8,
    name: "S2",
    status: "active",
    start_time: new Date("2026-07-20T01:00:00.000Z"),
    end_time: new Date("2026-07-21T01:00:00.000Z"),
    settled_at: null,
    created_at: new Date("2026-07-19T00:00:00.000Z"),
    updated_at: new Date("2026-07-20T01:00:00.000Z"),
  },
  { id: 7, name: "S1", status: "settled" },
];
const status = {
  season: {
    id: 8,
    name: "S2",
    start_time: new Date("2026-07-20T01:00:00.000Z"),
    end_time: new Date("2026-07-21T01:00:00.000Z"),
  },
  round: {
    id: 20,
    round_no: 3,
    current_hp: "9007199254740993",
    max_hp: "9007199254740994",
    created_at: new Date("2026-07-20T01:00:00.000Z"),
  },
  boss: { id: 2, name: "冰狼", hp_weight: "0.75" },
  ended: false,
};
const latestReward = {
  rewardId: 42,
  seasonId: 7,
  seasonName: "S1",
  ranking: 1,
  totalDamage: 500,
  stoneAmount: 100,
  titleKey: "worldboss_annihilator",
  titleName: "殲滅之王",
  paidAt: new Date("2026-07-19T12:00:00.000Z"),
  settledAt: new Date("2026-07-19T12:00:00.000Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  CatalogService.listBosses.mockResolvedValue(bossRows);
  CatalogService.createBoss.mockResolvedValue(3);
  CatalogService.updateBoss.mockResolvedValue(1);
  CatalogService.deleteBoss.mockResolvedValue(1);
  SeasonService.listSeasons.mockResolvedValue(seasonRows);
  SeasonService.createSeason.mockResolvedValue(9);
  SeasonService.updateSeason.mockResolvedValue(8);
  SeasonService.deleteSeason.mockResolvedValue(8);
  SeasonService.openSeason.mockResolvedValue({ seasonId: 8, round: status.round });
  SeasonService.getBattleStatus.mockResolvedValue(status);
  SeasonService.getRanking.mockResolvedValue([{ user_id: "Uone", total_damage: 500, ranking: 1 }]);
  SeasonService.getLatestSettledResult.mockResolvedValue(latestReward);
  BattleService.getRemainingDailyCost.mockResolvedValue({ limit: 100, used: 20, remaining: 80 });
  SeasonService.getUserTotalDamage.mockResolvedValue(500);
});

describe("World Boss admin boss handlers", () => {
  it("lists bosses through the catalog service without reordering them", async () => {
    const res = response();

    await admin.listBosses(request(), res);

    expect(CatalogService.listBosses).toHaveBeenCalledWith();
    expect(res.json.mock.calls[0][0].map(row => row.id)).toEqual([1, 2]);
    expect(res.json.mock.calls[0][0][0]).toMatchObject({
      created_at: "2026-07-19T01:02:03.000Z",
      updated_at: "2026-07-19T04:05:06.000Z",
    });
  });

  it.each([
    [{ name: "", hp_weight: 1 }, "INVALID_BOSS_NAME"],
    [{ name: "x".repeat(65), hp_weight: 1 }, "INVALID_BOSS_NAME"],
    [{ name: "炎龍", hp_weight: 0 }, "INVALID_HP_WEIGHT"],
    [{ name: "炎龍", hp_weight: "NaN" }, "INVALID_HP_WEIGHT"],
    [{ name: "炎龍", hp_weight: "Infinity" }, "INVALID_HP_WEIGHT"],
  ])("rejects an invalid create payload %# before calling the service", async (body, code) => {
    const res = response();

    await admin.createBoss(request({ body }), res);

    expect(CatalogService.createBoss).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: code });
  });

  it("creates a trimmed boss through the service", async () => {
    const res = response();

    await admin.createBoss(
      request({ body: { name: "  炎龍  ", hp_weight: "1.5", image: "a", description: "b" } }),
      res
    );

    expect(CatalogService.createBoss).toHaveBeenCalledWith({
      name: "炎龍",
      hp_weight: 1.5,
      image: "a",
      description: "b",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 3 });
  });

  it("maps zero affected boss updates and deletes to not found", async () => {
    CatalogService.updateBoss.mockResolvedValue(0);
    const updateRes = response();
    await admin.updateBoss(
      request({ params: { id: "404" }, body: { name: "炎龍", hp_weight: 1 } }),
      updateRes
    );
    expect(updateRes.status).toHaveBeenCalledWith(404);
    expect(updateRes.json).toHaveBeenCalledWith({ error: "BOSS_NOT_FOUND" });

    CatalogService.deleteBoss.mockResolvedValue(0);
    const deleteRes = response();
    await admin.deleteBoss(request({ params: { id: "404" } }), deleteRes);
    expect(deleteRes.status).toHaveBeenCalledWith(404);
    expect(deleteRes.json).toHaveBeenCalledWith({ error: "BOSS_NOT_FOUND" });
  });

  it("validates update and maps referenced deletes to conflict", async () => {
    const invalidRes = response();
    await admin.updateBoss(
      request({ params: { id: "2" }, body: { name: "炎龍", hp_weight: -1 } }),
      invalidRes
    );
    expect(CatalogService.updateBoss).not.toHaveBeenCalled();
    expect(invalidRes.status).toHaveBeenCalledWith(400);

    CatalogService.deleteBoss.mockRejectedValue(error("BOSS_IN_USE"));
    const conflictRes = response();
    await admin.deleteBoss(request({ params: { id: "2" } }), conflictRes);
    expect(CatalogService.deleteBoss).toHaveBeenCalledWith(2);
    expect(conflictRes.status).toHaveBeenCalledWith(409);
    expect(conflictRes.json).toHaveBeenCalledWith({ error: "BOSS_IN_USE" });
  });
});

describe("World Boss admin season handlers", () => {
  it("lists seasons through the season service without reordering them", async () => {
    const res = response();

    await admin.listSeasons(request(), res);

    expect(SeasonService.listSeasons).toHaveBeenCalledWith();
    expect(res.json.mock.calls[0][0].map(row => row.id)).toEqual([8, 7]);
    expect(res.json.mock.calls[0][0][0]).toMatchObject({
      start_time: "2026-07-20T01:00:00.000Z",
      end_time: "2026-07-21T01:00:00.000Z",
      settled_at: null,
      created_at: "2026-07-19T00:00:00.000Z",
      updated_at: "2026-07-20T01:00:00.000Z",
    });
  });

  it.each([
    [{ name: "", end_time: "2027-01-01T00:00:00.000Z" }, "INVALID_NAME"],
    [{ name: "S", end_time: "not-a-date" }, "INVALID_END_TIME"],
    [{ name: "S", end_time: "2026-01-01T00:00:00.000Z" }, "INVALID_END_TIME"],
    [{ name: "S", end_time: "2027-01-01" }, "INVALID_END_TIME"],
    [{ name: "S", end_time: "2027-02-31T00:00:00.000Z" }, "INVALID_END_TIME"],
  ])("rejects invalid season create payload %# before service", async (body, code) => {
    const res = response();

    await admin.createSeason(request({ body }), res);

    expect(SeasonService.createSeason).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: code });
  });

  it("creates a draft with an exact UTC end time and ignores client start time", async () => {
    const res = response();

    await admin.createSeason(
      request({
        body: {
          name: "  S3  ",
          announcement: "公告",
          end_time: "2027-01-01T00:00:00.000Z",
          start_time: "2099-01-01T00:00:00.000Z",
        },
      }),
      res
    );

    expect(SeasonService.createSeason).toHaveBeenCalledWith({
      name: "S3",
      announcement: "公告",
      end_time: new Date("2027-01-01T00:00:00.000Z"),
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 9 });
  });

  it.each([
    [{ end_time: "invalid" }, "INVALID_END_TIME"],
    [{ end_time: "2027-01-01" }, "INVALID_END_TIME"],
    [{ end_time: "2027-02-31T00:00:00.000Z" }, "INVALID_END_TIME"],
  ])("rejects invalid season update payload %# before service", async (body, code) => {
    const res = response();

    await admin.updateSeason(request({ params: { id: "8" }, body }), res);

    expect(SeasonService.updateSeason).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: code });
  });

  it("ignores client start time on draft update", async () => {
    const res = response();

    await admin.updateSeason(
      request({
        params: { id: "8" },
        body: { announcement: "updated", start_time: "2099-01-01T00:00:00.000Z" },
      }),
      res
    );

    expect(SeasonService.updateSeason).toHaveBeenCalledWith(8, { announcement: "updated" });
    expect(res.json).toHaveBeenCalledWith({});
  });

  it("maps active update/delete to conflict and malformed service input to bad request", async () => {
    SeasonService.updateSeason.mockRejectedValue(error("SEASON_NOT_DRAFT"));
    const updateRes = response();
    await admin.updateSeason(
      request({ params: { id: "8" }, body: { announcement: "x" } }),
      updateRes
    );
    expect(updateRes.status).toHaveBeenCalledWith(409);
    expect(updateRes.json).toHaveBeenCalledWith({ error: "SEASON_NOT_DRAFT" });

    SeasonService.deleteSeason.mockRejectedValue(error("SEASON_NOT_DRAFT"));
    const deleteRes = response();
    await admin.deleteSeason(request({ params: { id: "8" } }), deleteRes);
    expect(deleteRes.status).toHaveBeenCalledWith(409);

    SeasonService.updateSeason.mockRejectedValue(error("INVALID_END_TIME"));
    const badRes = response();
    await admin.updateSeason(request({ params: { id: "8" }, body: { announcement: "x" } }), badRes);
    expect(badRes.status).toHaveBeenCalledWith(400);
  });

  it.each([
    ["updateBoss", "1.5", "updateBoss"],
    ["deleteBoss", "0", "deleteBoss"],
    ["updateSeason", "9007199254740992", "updateSeason"],
    ["deleteSeason", "NaN", "deleteSeason"],
    ["openSeason", "-1", "openSeason"],
  ])("rejects invalid path ids for %s before service", async (handler, id, serviceMethod) => {
    const res = response();
    const body = handler === "updateBoss" ? { name: "炎龍", hp_weight: 1 } : {};

    await admin[handler](request({ params: { id }, body }), res);

    const service = ["updateBoss", "deleteBoss"].includes(serviceMethod)
      ? CatalogService
      : SeasonService;
    expect(service[serviceMethod]).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "INVALID_ID" });
  });

  it("opens immediately without passing any client time", async () => {
    const res = response();

    await admin.openSeason(
      request({
        params: { id: "8" },
        body: { start_time: "2099-01-01T00:00:00.000Z", end_time: "2099-02-01T00:00:00.000Z" },
      }),
      res
    );

    expect(SeasonService.openSeason).toHaveBeenCalledWith(8);
    expect(res.json.mock.calls[0][0]).toMatchObject({ seasonId: 8 });
    expect(res.json.mock.calls[0][0].round.created_at).toBe("2026-07-20T01:00:00.000Z");
  });

  it.each([
    ["ANOTHER_SEASON_ACTIVE", 409],
    ["SEASON_NOT_DRAFT", 409],
    ["SEASON_NOT_FOUND", 404],
    ["INVALID_END_TIME", 400],
    ["NO_WORLD_BOSS", 422],
    ["INVALID_MAX_HP", 422],
    ["WORLD_BOSS_NOT_FOUND", 422],
  ])("maps %s to HTTP %i", async (code, statusCode) => {
    SeasonService.openSeason.mockRejectedValue(error(code));
    const res = response();

    await admin.openSeason(request({ params: { id: "8" } }), res);

    expect(res.status).toHaveBeenCalledWith(statusCode);
    expect(res.json).toHaveBeenCalledWith({ error: code });
  });
});

describe("World Boss public handlers", () => {
  it("returns status with all nested datetimes serialized as UTC ISO strings", async () => {
    const res = response();

    await publicHandler.status(request(), res);

    expect(SeasonService.getBattleStatus).toHaveBeenCalledWith();
    expect(res.json.mock.calls[0][0]).toMatchObject({
      season: {
        start_time: "2026-07-20T01:00:00.000Z",
        end_time: "2026-07-21T01:00:00.000Z",
      },
      round: { created_at: "2026-07-20T01:00:00.000Z" },
    });
    expect(res.json.mock.calls[0][0].round.current_hp).toBe("9007199254740993");
  });

  it.each([
    [undefined, 50],
    ["1", 1],
    ["100", 100],
  ])("accepts leaderboard limit %s as %i", async (limit, expected) => {
    const res = response();
    const query = limit === undefined ? {} : { limit };

    await publicHandler.leaderboard(request({ query }), res);

    expect(SeasonService.getBattleStatus).toHaveBeenCalledWith();
    expect(SeasonService.getRanking).toHaveBeenCalledWith(8, expected);
    expect(res.json).toHaveBeenCalledWith([{ user_id: "Uone", total_damage: 500, ranking: 1 }]);
  });

  it.each(["0", "101", "1.5", "NaN", "Infinity", "", " 1"])(
    "rejects leaderboard limit %p without calling ranking",
    async limit => {
      const res = response();

      await publicHandler.leaderboard(request({ query: { limit } }), res);

      expect(SeasonService.getRanking).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "INVALID_RANKING_LIMIT" });
    }
  );

  it("returns an empty ranking without an active season", async () => {
    SeasonService.getBattleStatus.mockResolvedValue(null);
    const res = response();

    await publicHandler.leaderboard(request(), res);

    expect(SeasonService.getRanking).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("returns latest reward even when there is no active season", async () => {
    SeasonService.getBattleStatus.mockResolvedValue(null);
    const res = response();

    await publicHandler.me(request({ userId: "Ume" }), res);

    expect(SeasonService.getLatestSettledResult).toHaveBeenCalledWith("Ume");
    expect(SeasonService.getUserTotalDamage).not.toHaveBeenCalled();
    expect(BattleService.getRemainingDailyCost).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      current: null,
      latestReward: {
        ...latestReward,
        paidAt: "2026-07-19T12:00:00.000Z",
        settledAt: "2026-07-19T12:00:00.000Z",
      },
    });
  });

  it("keeps an ended-but-unsettled active season available to leaderboard and me", async () => {
    SeasonService.getBattleStatus.mockResolvedValue({ ...status, ended: true });
    const leaderboardRes = response();
    await publicHandler.leaderboard(request(), leaderboardRes);
    expect(SeasonService.getRanking).toHaveBeenCalledWith(8, 50);
    expect(leaderboardRes.json).toHaveBeenCalledWith([
      { user_id: "Uone", total_damage: 500, ranking: 1 },
    ]);

    const meRes = response();
    await publicHandler.me(request({ userId: "Ume" }), meRes);
    expect(SeasonService.getUserTotalDamage).toHaveBeenCalledWith(8, "Ume");
    expect(meRes.json.mock.calls[0][0].current).toMatchObject({ seasonId: 8, totalDamage: 500 });
  });

  it("returns exact current damage outside the top 100 and latest reward independently", async () => {
    SeasonService.getRanking.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({
        user_id: `Uranked${index + 1}`,
        total_damage: 1000 - index,
        ranking: index + 1,
      }))
    );
    SeasonService.getUserTotalDamage.mockResolvedValue(500);
    const res = response();

    await publicHandler.me(request({ userId: "Ume" }), res);

    expect(SeasonService.getRanking).not.toHaveBeenCalled();
    expect(SeasonService.getUserTotalDamage).toHaveBeenCalledWith(8, "Ume");
    expect(BattleService.getRemainingDailyCost).toHaveBeenCalledWith("Ume");
    expect(res.json.mock.calls[0][0]).toEqual({
      current: {
        seasonId: 8,
        totalDamage: 500,
        daily: { limit: 100, used: 20, remaining: 80 },
      },
      latestReward: {
        ...latestReward,
        paidAt: "2026-07-19T12:00:00.000Z",
        settledAt: "2026-07-19T12:00:00.000Z",
      },
    });
  });

  it("maps service validation errors and unexpected failures centrally", async () => {
    SeasonService.getRanking.mockRejectedValueOnce(error("INVALID_RANKING_LIMIT"));
    const badRes = response();
    await publicHandler.leaderboard(request(), badRes);
    expect(badRes.status).toHaveBeenCalledWith(400);

    const databaseError = new Error("database unavailable");
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    SeasonService.getBattleStatus.mockRejectedValueOnce(databaseError);
    const failedRes = response();
    await publicHandler.status(request(), failedRes);
    expect(failedRes.status).toHaveBeenCalledWith(500);
    expect(failedRes.json).toHaveBeenCalledWith({ error: "INTERNAL_ERROR" });
    expect(consoleError).toHaveBeenCalledWith("[world-boss-api]", databaseError);
    consoleError.mockRestore();
  });
});

describe("World Boss router auth wiring", () => {
  it("enforces token, admin, and privilege-five middleware on the effective parent router", async () => {
    let isolated;
    jest.isolateModules(() => {
      const validation = require("../../../middleware/validation");
      const privilegeMiddleware = jest.fn((req, res, next) => next());
      const verifyPrivilege = jest.fn(() => privilegeMiddleware);
      validation.verifyPrivilege = verifyPrivilege;
      const worldBossRouters = require("../../../router/WorldBoss");
      const api = require("../../../router/api");
      const app = express();
      app.use(express.json());
      app.use("/api", api);
      isolated = { api, app, validation, verifyPrivilege, privilegeMiddleware, worldBossRouters };
    });

    await supertest(isolated.app).get("/api/world-boss/status").expect(200);
    await supertest(isolated.app).get("/api/admin/world-bosses").expect(200);

    const { api, validation, verifyPrivilege, privilegeMiddleware, worldBossRouters } = isolated;
    const stack = api.stack;
    const publicIndex = stack.findIndex(layer => layer.handle === worldBossRouters.public);
    const publicTokenIndex = stack
      .slice(0, publicIndex)
      .findLastIndex(layer => layer.handle === validation.verifyToken);
    const adminRouterIndex = stack.findIndex(layer => layer.handle === worldBossRouters.admin);
    const adminGateIndex = stack
      .slice(0, adminRouterIndex)
      .findLastIndex(
        (layer, index, layers) =>
          layer.handle === validation.verifyToken &&
          layers[index + 1]?.handle === validation.verifyAdmin &&
          layers[index + 2]?.handle === privilegeMiddleware
      );

    expect(verifyPrivilege).toHaveBeenCalledWith(5);
    expect(publicIndex).toBeGreaterThan(publicTokenIndex);
    expect(publicTokenIndex).toBeGreaterThanOrEqual(0);
    expect(adminGateIndex).toBeGreaterThan(publicIndex);
    expect(adminRouterIndex).toBeGreaterThan(adminGateIndex + 2);
  });

  it("registers the required public and admin route handlers", () => {
    const { admin: AdminRouter, public: PublicRouter } = require("../../../router/WorldBoss");
    const adminRoutes = AdminRouter.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
    const publicRoutes = PublicRouter.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));

    expect(adminRoutes).toEqual([
      { path: "/world-bosses", methods: ["get"] },
      { path: "/world-bosses", methods: ["post"] },
      { path: "/world-bosses/:id", methods: ["put"] },
      { path: "/world-bosses/:id", methods: ["delete"] },
      { path: "/world-boss-seasons", methods: ["get"] },
      { path: "/world-boss-seasons", methods: ["post"] },
      { path: "/world-boss-seasons/:id", methods: ["put"] },
      { path: "/world-boss-seasons/:id", methods: ["delete"] },
      { path: "/world-boss-seasons/:id/open", methods: ["post"] },
    ]);
    expect(publicRoutes).toEqual([
      { path: "/status", methods: ["get"] },
      { path: "/leaderboard", methods: ["get"] },
      { path: "/me", methods: ["get"] },
    ]);
  });
});
