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
  getUserSeasonStats: jest.fn(),
  getLatestSettledResult: jest.fn(),
}));
jest.mock("../../../service/WorldBossBattleService", () => ({
  getRemainingDailyCost: jest.fn(),
}));
jest.mock("../../../service/WorldBossAttackService", () => ({ attack: jest.fn() }));
jest.mock("../../../service/MinigameService", () => ({ findByUserId: jest.fn() }));
jest.mock("../../../model/application/WorldBossRoundEffect", () => ({
  listSeasonHistoryBySource: jest.fn(),
  listSeasonHistoryByConsumer: jest.fn(),
}));
jest.mock("../../../model/application/UserModel", () => ({ getDisplayNames: jest.fn() }));
const CatalogService = require("../../../service/WorldBossCatalogService");
const SeasonService = require("../../../service/WorldBossSeasonService");
const BattleService = require("../../../service/WorldBossBattleService");
const AttackService = require("../../../service/WorldBossAttackService");
const MinigameService = require("../../../service/MinigameService");
const WorldBossRoundEffect = require("../../../model/application/WorldBossRoundEffect");
const UserModel = require("../../../model/application/UserModel");
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

function request({ body = {}, params = {}, query = {}, userId = "Uworldboss", displayName } = {}) {
  return { body, params, query, profile: { userId, displayName } };
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
  cycleNo: 3,
  rounds: [1, 2, 3, 4, 5].map(position => ({
    id: 19 + position,
    cycle_no: 3,
    position,
    current_hp: position === 1 ? "9007199254740993" : "100",
    max_hp: position === 1 ? "9007199254740994" : "200",
    created_at: new Date("2026-07-20T01:00:00.000Z"),
    world_boss_id: position,
    name: `王${position}`,
  })),
  ended: false,
};
const latestReward = {
  rewardId: 42,
  seasonId: 7,
  seasonName: "S1",
  ranking: 1,
  totalScore: "1200",
  totalDamage: "500",
  stoneAmount: 100,
  titleKey: "worldboss_annihilator",
  titleName: "殲滅之王",
  paidAt: new Date("2026-07-19T12:00:00.000Z"),
  settledAt: new Date("2026-07-19T12:00:00.000Z"),
};

// Mirrors WorldBossSeasonService.getUserSeasonStats after Lane D: score and damage are
// two separate ledgers, every BIGINT is a decimal string.
const seasonStats = {
  seasonId: "8",
  totalScore: "700",
  score: { direct: "500", assist: "150", relay: "50" },
  damage: { raw: "500", effect: "100", effective: "550", overkill: "50" },
};

// Mirrors the BattleService attack DTO after Lane C. `damage` / `wastedDamage` are gone;
// keeping them here is what made the old handler test green against a dead field.
const attackResult = {
  rawDamage: "500",
  effectDamage: "100",
  effectiveDamage: "400",
  overkillDamage: "200",
  scoreGained: { direct: "500", assist: "100", relay: "0" },
  consumedEffect: { id: "31", type: "seal", value: "100", sourceUserId: "Usource" },
  createdEffect: { id: "32", type: "banner", value: "125", sourceUserId: "Uworldboss" },
  cost: 15,
  cleared: true,
  cycleAdvanced: false,
  attackedCycleNo: 3,
  cycleNo: 3,
  round: { id: 21, position: 2, current_hp: "0", max_hp: "400" },
  boss: { id: 2, position: 2, name: "王2" },
  rounds: status.rounds,
  levelResult: { levelUp: true, newLevel: 9, newExp: 3 },
  seasonTotalScore: "9007199254740993",
  seasonTotalDamage: "9007199254740991",
  daily: { limit: 100, used: 35, remaining: 65 },
};

const effectHistoryRows = [
  {
    id: "31",
    round_id: "21",
    effect_type: "seal",
    value: "100",
    created_at: new Date("2026-07-20T02:00:00.000Z"),
    consumed_by_user_id: "Utaker",
    consumed_at: new Date("2026-07-20T02:05:00.000Z"),
  },
  {
    id: "30",
    round_id: "20",
    effect_type: "banner",
    value: "25",
    created_at: new Date("2026-07-20T01:30:00.000Z"),
    consumed_by_user_id: null,
    consumed_at: null,
  },
];

const displayNames = { Utaker: "接棒者", Usource: "留效果的人" };

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
  SeasonService.openSeason.mockResolvedValue({ seasonId: 8, cycleNo: 3, rounds: status.rounds });
  SeasonService.getBattleStatus.mockResolvedValue(status);
  SeasonService.getRanking.mockResolvedValue([
    { user_id: "Uone", display_name: "玩家甲", total_score: "500", ranking: 1 },
  ]);
  SeasonService.getLatestSettledResult.mockResolvedValue(latestReward);
  BattleService.getRemainingDailyCost.mockResolvedValue({ limit: 100, used: 20, remaining: 80 });
  SeasonService.getUserSeasonStats.mockResolvedValue(seasonStats);
  WorldBossRoundEffect.listSeasonHistoryBySource.mockResolvedValue(effectHistoryRows);
  WorldBossRoundEffect.listSeasonHistoryByConsumer.mockResolvedValue([]);
  // Shaped like the real `minigame_level` row (see MinigameLevel.findByUserId): a bare
  // `{ job_key }` mock would silently pass a handler that drops `level`.
  MinigameService.findByUserId.mockResolvedValue({ job_key: "adventurer", level: 42 });
  UserModel.getDisplayNames.mockImplementation(
    async ids =>
      new Map(
        [...new Set(ids)]
          .filter(id => Object.hasOwn(displayNames, id))
          .map(id => [id, displayNames[id]])
      )
  );
  AttackService.attack.mockResolvedValue({
    result: attackResult,
    announcementQueued: true,
    latestReward: null,
  });
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
    expect(CatalogService.deleteBoss).toHaveBeenCalledWith("2");
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
          boss_ids: ["1", "2", "3", "4", "5"],
          start_time: "2099-01-01T00:00:00.000Z",
        },
      }),
      res
    );

    expect(SeasonService.createSeason).toHaveBeenCalledWith({
      name: "S3",
      announcement: "公告",
      end_time: new Date("2027-01-01T00:00:00.000Z"),
      boss_ids: ["1", "2", "3", "4", "5"],
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

    expect(SeasonService.updateSeason).toHaveBeenCalledWith("8", { announcement: "updated" });
    expect(res.json).toHaveBeenCalledWith({});
  });

  it("passes boss_ids through on draft update", async () => {
    const res = response();
    await admin.updateSeason(
      request({ params: { id: "8" }, body: { boss_ids: ["5", "4", "3", "2", "1"] } }),
      res
    );
    expect(SeasonService.updateSeason).toHaveBeenCalledWith("8", {
      boss_ids: ["5", "4", "3", "2", "1"],
    });
  });

  it("passes canonical BIGINT path ids without Number coercion", async () => {
    const id = "9007199254740993";
    const res = response();

    await admin.updateSeason(request({ params: { id }, body: { announcement: "updated" } }), res);

    expect(SeasonService.updateSeason).toHaveBeenCalledWith(id, { announcement: "updated" });
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
    ["updateSeason", "01", "updateSeason"],
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

    expect(SeasonService.openSeason).toHaveBeenCalledWith("8");
    expect(res.json.mock.calls[0][0]).toMatchObject({ seasonId: 8 });
    expect(res.json.mock.calls[0][0].rounds).toHaveLength(5);
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
      rounds: expect.any(Array),
    });
    expect(res.json.mock.calls[0][0].rounds[0].current_hp).toBe("9007199254740993");
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
    expect(SeasonService.getRanking).toHaveBeenCalledWith("8", expected);
    expect(res.json).toHaveBeenCalledWith({
      seasonId: "8",
      rows: [{ user_id: "Uone", display_name: "玩家甲", total_score: "500", ranking: 1 }],
    });
  });

  it("ranks the leaderboard by total_score and never exposes total_damage", async () => {
    // Guards the exact false-green Lane D found: the service stopped producing
    // `total_damage`, but the handler forwarded rows verbatim, so the test stayed green
    // while the board rendered blanks. A stray damage column must not survive the DTO.
    SeasonService.getRanking.mockResolvedValue([
      {
        user_id: "Uone",
        display_name: "玩家甲",
        total_score: "900",
        ranking: 1,
        total_damage: "7",
      },
    ]);
    const res = response();

    await publicHandler.leaderboard(request(), res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.rows).toEqual([
      { user_id: "Uone", display_name: "玩家甲", total_score: "900", ranking: 1 },
    ]);
    expect(Object.keys(payload.rows[0])).not.toContain("total_damage");
  });

  it("defaults a missing leaderboard display_name to null", async () => {
    SeasonService.getRanking.mockResolvedValue([
      { user_id: "Uone", display_name: null, total_score: "500", ranking: 1 },
    ]);
    const res = response();

    await publicHandler.leaderboard(request(), res);

    expect(res.json).toHaveBeenCalledWith({
      seasonId: "8",
      rows: [{ user_id: "Uone", display_name: null, total_score: "500", ranking: 1 }],
    });
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
    expect(res.json).toHaveBeenCalledWith({ seasonId: null, rows: [] });
  });

  it("returns latest reward even when there is no active season", async () => {
    SeasonService.getBattleStatus.mockResolvedValue(null);
    const res = response();

    await publicHandler.me(request({ userId: "Ume" }), res);

    expect(SeasonService.getLatestSettledResult).toHaveBeenCalledWith("Ume");
    expect(SeasonService.getUserSeasonStats).not.toHaveBeenCalled();
    expect(BattleService.getRemainingDailyCost).not.toHaveBeenCalled();
    expect(WorldBossRoundEffect.listSeasonHistoryBySource).not.toHaveBeenCalled();
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
    expect(SeasonService.getRanking).toHaveBeenCalledWith("8", 50);
    expect(leaderboardRes.json).toHaveBeenCalledWith({
      seasonId: "8",
      rows: [{ user_id: "Uone", display_name: "玩家甲", total_score: "500", ranking: 1 }],
    });

    const meRes = response();
    await publicHandler.me(request({ userId: "Ume" }), meRes);
    expect(SeasonService.getUserSeasonStats).toHaveBeenCalledWith("8", "Ume");
    expect(meRes.json.mock.calls[0][0].current).toMatchObject({
      seasonId: "8",
      totalScore: "700",
    });
  });

  it("returns the full score breakdown and damage stats for the caller", async () => {
    const res = response();

    await publicHandler.me(request({ userId: "Ume" }), res);

    expect(SeasonService.getRanking).not.toHaveBeenCalled();
    expect(SeasonService.getUserSeasonStats).toHaveBeenCalledWith("8", "Ume");
    expect(BattleService.getRemainingDailyCost).toHaveBeenCalledWith("Ume");
    expect(res.json.mock.calls[0][0].current).toEqual({
      seasonId: "8",
      totalScore: "700",
      score: { direct: "500", assist: "150", relay: "50" },
      damage: { raw: "500", effect: "100", effective: "550", overkill: "50" },
      daily: { limit: 100, used: 20, remaining: 80 },
      jobKey: "adventurer",
      level: 42,
      effects: {
        left: [
          {
            effectId: "31",
            type: "seal",
            value: "100",
            roundId: "21",
            createdAt: "2026-07-20T02:00:00.000Z",
            consumedAt: "2026-07-20T02:05:00.000Z",
            consumedBy: { userId: "Utaker", displayName: "接棒者" },
            expired: false,
          },
          {
            effectId: "30",
            type: "banner",
            value: "25",
            roundId: "20",
            createdAt: "2026-07-20T01:30:00.000Z",
            consumedAt: null,
            consumedBy: null,
            expired: false,
          },
        ],
        taken: [],
      },
    });
    expect(res.json.mock.calls[0][0].latestReward).toMatchObject({
      totalScore: "1200",
      totalDamage: "500",
    });
  });

  it("reads its subject only from the authenticated profile", async () => {
    const res = response();

    // Every possible way to name a different subject: body, params and query.
    await publicHandler.me(
      {
        body: { userId: "Uvictim" },
        params: { userId: "Uvictim" },
        query: { userId: "Uvictim", user_id: "Uvictim" },
        profile: { userId: "Ureal" },
      },
      res
    );

    expect(SeasonService.getLatestSettledResult).toHaveBeenCalledWith("Ureal");
    expect(SeasonService.getUserSeasonStats).toHaveBeenCalledWith("8", "Ureal");
    expect(BattleService.getRemainingDailyCost).toHaveBeenCalledWith("Ureal");
    expect(WorldBossRoundEffect.listSeasonHistoryBySource).toHaveBeenCalledWith({
      seasonId: "8",
      userId: "Ureal",
      limit: 50,
    });
    for (const call of [
      ...SeasonService.getUserSeasonStats.mock.calls,
      ...SeasonService.getLatestSettledResult.mock.calls,
      ...WorldBossRoundEffect.listSeasonHistoryBySource.mock.calls,
    ]) {
      expect(JSON.stringify(call)).not.toContain("Uvictim");
    }
  });

  it("tolerates a v1 latestReward whose totalScore is null", async () => {
    SeasonService.getLatestSettledResult.mockResolvedValue({ ...latestReward, totalScore: null });
    const res = response();

    await publicHandler.me(request({ userId: "Ume" }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].latestReward).toMatchObject({
      totalScore: null,
      totalDamage: "500",
    });
    expect(() => JSON.stringify(res.json.mock.calls[0][0])).not.toThrow();
  });

  it("caps effect history at the newest 50 rows and never queries names per row", async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      id: String(500 - index),
      round_id: "21",
      effect_type: index % 2 ? "banner" : "seal",
      value: "10",
      created_at: new Date("2026-07-20T02:00:00.000Z"),
      consumed_by_user_id: index % 2 ? "Utaker" : null,
      consumed_at: index % 2 ? new Date("2026-07-20T02:05:00.000Z") : null,
    }));
    WorldBossRoundEffect.listSeasonHistoryBySource.mockResolvedValue(rows);
    const res = response();

    await publicHandler.me(request({ userId: "Ume" }), res);

    expect(WorldBossRoundEffect.listSeasonHistoryBySource).toHaveBeenCalledTimes(1);
    expect(WorldBossRoundEffect.listSeasonHistoryBySource).toHaveBeenCalledWith({
      seasonId: "8",
      userId: "Ume",
      limit: 50,
    });
    // One batched name lookup for 25 consumers — not one per row.
    expect(UserModel.getDisplayNames).toHaveBeenCalledTimes(1);
    expect(UserModel.getDisplayNames).toHaveBeenCalledWith(new Array(25).fill("Utaker"));
    const { effects } = res.json.mock.calls[0][0].current;
    expect(effects.left).toHaveLength(50);
    expect(effects.left.map(row => row.effectId)).toEqual(rows.map(row => String(row.id)));
    expect(effects.left[0].effectId).toBe("500");
    expect(effects.left.at(-1).effectId).toBe("451");
  });

  it("returns an empty effect history without any name lookup", async () => {
    WorldBossRoundEffect.listSeasonHistoryBySource.mockResolvedValue([]);
    const res = response();

    await publicHandler.me(request({ userId: "Ume" }), res);

    expect(res.json.mock.calls[0][0].current.effects).toEqual({ left: [], taken: [] });
    expect(UserModel.getDisplayNames).toHaveBeenCalledWith([]);
    expect(UserModel.getDisplayNames).toHaveBeenCalledTimes(1);
  });

  it("keeps consumedBy.displayName null when the consumer has no stored profile", async () => {
    WorldBossRoundEffect.listSeasonHistoryBySource.mockResolvedValue([
      {
        id: "31",
        round_id: "21",
        effect_type: "banner",
        value: "25",
        created_at: new Date("2026-07-20T02:00:00.000Z"),
        consumed_by_user_id: "Unameless",
        consumed_at: new Date("2026-07-20T02:05:00.000Z"),
      },
    ]);
    const res = response();

    await publicHandler.me(request({ userId: "Ume" }), res);

    expect(res.json.mock.calls[0][0].current.effects.left[0].consumedBy).toEqual({
      userId: "Unameless",
      displayName: null,
    });
  });

  it("returns effects taken by the caller with the source name", async () => {
    WorldBossRoundEffect.listSeasonHistoryByConsumer.mockResolvedValue([
      {
        id: "127",
        round_id: "103",
        effect_type: "seal",
        value: "11692",
        source_user_id: "Usource",
        taken_at: new Date("2026-09-01T02:09:42.000Z"),
      },
    ]);
    const res = response();

    await publicHandler.me(request({ userId: "Utaker" }), res);

    expect(res.json.mock.calls[0][0].current.effects.taken).toEqual([
      {
        effectId: "127",
        type: "seal",
        value: "11692",
        roundId: "103",
        takenAt: "2026-09-01T02:09:42.000Z",
        source: { userId: "Usource", displayName: "留效果的人" },
      },
    ]);
    expect(UserModel.getDisplayNames).toHaveBeenCalledWith(["Utaker", "Usource"]);
  });

  it("returns a job fallback and taken effects for a job without left effects", async () => {
    MinigameService.findByUserId.mockResolvedValue(null);
    WorldBossRoundEffect.listSeasonHistoryBySource.mockResolvedValue([]);
    WorldBossRoundEffect.listSeasonHistoryByConsumer.mockResolvedValue([
      {
        id: "127",
        round_id: "103",
        effect_type: "seal",
        value: "11692",
        source_user_id: "Usource",
        taken_at: new Date("2026-09-01T02:09:42.000Z"),
      },
    ]);
    const res = response();

    await publicHandler.me(request({ userId: "Uswordman" }), res);

    expect(res.json.mock.calls[0][0].current.jobKey).toBe("adventurer");
    expect(res.json.mock.calls[0][0].current.effects.left).toEqual([]);
    expect(res.json.mock.calls[0][0].current.effects.taken).toHaveLength(1);
  });

  it("preserves an exact active season ID through leaderboard and me", async () => {
    const exactSeasonId = "9007199254740993";
    SeasonService.getBattleStatus.mockResolvedValue({
      ...status,
      season: { ...status.season, id: exactSeasonId },
    });
    SeasonService.getUserSeasonStats.mockResolvedValue({
      ...seasonStats,
      seasonId: exactSeasonId,
    });
    const leaderboardRes = response();

    await publicHandler.leaderboard(request(), leaderboardRes);
    expect(SeasonService.getRanking).toHaveBeenCalledWith(exactSeasonId, 50);
    expect(leaderboardRes.json).toHaveBeenCalledWith({
      seasonId: exactSeasonId,
      rows: [{ user_id: "Uone", display_name: "玩家甲", total_score: "500", ranking: 1 }],
    });

    const meRes = response();
    await publicHandler.me(request({ userId: "Uexact" }), meRes);
    expect(SeasonService.getUserSeasonStats).toHaveBeenCalledWith(exactSeasonId, "Uexact");
    expect(meRes.json.mock.calls[0][0].current).toMatchObject({ seasonId: exactSeasonId });
  });

  it("serializes exact ids, scores and damage as strings without JSON BigInt", async () => {
    const seasonId = "9007199254740993";
    SeasonService.getBattleStatus.mockResolvedValue({
      ...status,
      season: { ...status.season, id: seasonId },
    });
    SeasonService.getRanking.mockResolvedValue([
      { user_id: "Uexact", display_name: null, total_score: "9007199254740993", ranking: 1 },
      { user_id: "Ulower", display_name: null, total_score: "9007199254740992", ranking: 2 },
    ]);
    SeasonService.getUserSeasonStats.mockResolvedValue({
      seasonId,
      totalScore: "9007199254740993",
      score: { direct: "9007199254740991", assist: "1", relay: "1" },
      damage: {
        raw: "9007199254740993",
        effect: "9007199254740994",
        effective: "9007199254740995",
        overkill: "9007199254740992",
      },
    });
    SeasonService.getLatestSettledResult.mockResolvedValue({
      ...latestReward,
      seasonId,
      totalScore: "9007199254740993",
      totalDamage: "9007199254740991",
    });

    const leaderboardRes = response();
    await publicHandler.leaderboard(request(), leaderboardRes);
    expect(SeasonService.getRanking).toHaveBeenCalledWith(seasonId, 50);
    expect(leaderboardRes.json).toHaveBeenCalledWith({
      seasonId,
      rows: [
        { user_id: "Uexact", display_name: null, total_score: "9007199254740993", ranking: 1 },
        { user_id: "Ulower", display_name: null, total_score: "9007199254740992", ranking: 2 },
      ],
    });

    const meRes = response();
    await publicHandler.me(request({ userId: "Uexact" }), meRes);
    const [payload] = meRes.json.mock.calls[0];
    expect(payload).toMatchObject({
      current: {
        seasonId,
        totalScore: "9007199254740993",
        damage: { effective: "9007199254740995" },
      },
      latestReward: { seasonId, totalScore: "9007199254740993", totalDamage: "9007199254740991" },
    });
    // Every BIGINT-bearing field must be a string, or JSON.parse would round it.
    for (const value of [
      payload.current.totalScore,
      ...Object.values(payload.current.score),
      ...Object.values(payload.current.damage),
      payload.latestReward.totalScore,
      payload.latestReward.totalDamage,
      ...leaderboardRes.json.mock.calls[0][0].rows.map(row => row.total_score),
    ]) {
      expect(typeof value).toBe("string");
    }
    expect(() => JSON.stringify(payload)).not.toThrow();
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

describe("World Boss attack handler", () => {
  const body = { roundId: 21, attackType: "standard" };

  it("acts as the authenticated user and ignores a spoofed body userId", async () => {
    const res = response();

    await publicHandler.attack(
      request({
        body: { ...body, userId: "Uvictim", user_id: "Uvictim", profile: { userId: "Uvictim" } },
        userId: "Ureal",
        displayName: "真實玩家",
      }),
      res
    );

    expect(AttackService.attack).toHaveBeenCalledWith({
      userId: "Ureal",
      roundId: "21",
      attackType: "standard",
      groupId: null,
      displayName: "真實玩家",
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, "INVALID_ROUND_ID"],
    [{}, "INVALID_ROUND_ID"],
    [{ attackType: "standard" }, "INVALID_ROUND_ID"],
    [{ roundId: 0, attackType: "standard" }, "INVALID_ROUND_ID"],
    [{ roundId: -1, attackType: "standard" }, "INVALID_ROUND_ID"],
    [{ roundId: "1.5", attackType: "standard" }, "INVALID_ROUND_ID"],
    [{ roundId: " 1", attackType: "standard" }, "INVALID_ROUND_ID"],
    [{ roundId: "abc", attackType: "standard" }, "INVALID_ROUND_ID"],
    [{ roundId: 21 }, "INVALID_ATTACK_TYPE"],
    [{ roundId: 21, attackType: "ultimate" }, "INVALID_ATTACK_TYPE"],
    [{ roundId: 21, attackType: "STANDARD" }, "INVALID_ATTACK_TYPE"],
    [{ roundId: 21, attackType: "standard", groupId: "nope" }, "INVALID_GROUP_ID"],
    [{ roundId: 21, attackType: "standard", groupId: `U${"a".repeat(32)}` }, "INVALID_GROUP_ID"],
    [{ roundId: 21, attackType: "standard", groupId: `R${"f".repeat(32)}` }, "INVALID_GROUP_ID"],
    [{ roundId: 21, attackType: "standard", groupId: `C${"A".repeat(32)}` }, "INVALID_GROUP_ID"],
    [{ roundId: 21, attackType: "standard", groupId: 12345 }, "INVALID_GROUP_ID"],
  ])("rejects body %p with 400 %s before calling the service", async (payload, code) => {
    const res = response();

    await publicHandler.attack(request({ body: payload }), res);

    expect(AttackService.attack).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: code });
  });

  it.each([undefined, null])("treats groupId %p as absent, not invalid", async groupId => {
    const res = response();

    await publicHandler.attack(request({ body: { ...body, groupId } }), res);

    expect(AttackService.attack).toHaveBeenCalledWith(expect.objectContaining({ groupId: null }));
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([`C${"a".repeat(32)}`, `C${"0".repeat(32)}`])(
    "forwards a well-formed group id %s for server-side verification",
    async groupId => {
      const res = response();

      await publicHandler.attack(request({ body: { ...body, groupId } }), res);

      expect(AttackService.attack).toHaveBeenCalledWith(expect.objectContaining({ groupId }));
    }
  );

  it("returns the private success DTO with exact big integers and the announcement flag", async () => {
    const reward = { rewardId: 42, paidAt: new Date("2026-07-19T12:00:00.000Z") };
    AttackService.attack.mockResolvedValue({
      result: attackResult,
      announcementQueued: true,
      latestReward: reward,
    });
    const res = response();

    await publicHandler.attack(request({ body: { ...body, roundId: "21" } }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      attack: {
        roundId: "21",
        attackType: "standard",
        rawDamage: "500",
        effectDamage: "100",
        effectiveDamage: "400",
        overkillDamage: "200",
        scoreGained: { direct: "500", assist: "100", relay: "0" },
        consumedEffect: {
          id: "31",
          type: "seal",
          value: "100",
          sourceUserId: "Usource",
          sourceDisplayName: "留效果的人",
        },
        createdEffect: { id: "32", type: "banner", value: "125", sourceUserId: "Uworldboss" },
        cost: 15,
        cleared: true,
        cycleAdvanced: false,
        attackedCycleNo: 3,
        cycleNo: 3,
        round: { id: 21, position: 2, current_hp: "0", max_hp: "400" },
        boss: { id: 2, position: 2, name: "王2" },
        rounds: expect.any(Array),
        levelResult: { levelUp: true, newLevel: 9, newExp: 3 },
        seasonTotalScore: "9007199254740993",
        seasonTotalDamage: "9007199254740991",
        daily: { limit: 100, used: 35, remaining: 65 },
      },
      announcementQueued: true,
      latestReward: { rewardId: 42, paidAt: "2026-07-19T12:00:00.000Z" },
      status: expect.objectContaining({ season: expect.any(Object) }),
    });
    expect(() => JSON.stringify(res.json.mock.calls[0][0])).not.toThrow();
  });

  it("keeps the three damage layers consistent and BIGINT-exact as strings", async () => {
    // raw + effect - effective === overkill, at magnitudes a JS number would round.
    AttackService.attack.mockResolvedValue({
      result: {
        ...attackResult,
        rawDamage: "9007199254740993",
        effectDamage: "9007199254740993",
        effectiveDamage: "9007199254740991",
        overkillDamage: "9007199254740995",
        seasonTotalScore: "18014398509481986",
        seasonTotalDamage: "9007199254740991",
      },
      announcementQueued: false,
      latestReward: null,
    });
    const res = response();

    await publicHandler.attack(request({ body }), res);

    const { attack } = res.json.mock.calls[0][0];
    for (const field of [
      "rawDamage",
      "effectDamage",
      "effectiveDamage",
      "overkillDamage",
      "seasonTotalScore",
      "seasonTotalDamage",
    ]) {
      expect(typeof attack[field]).toBe("string");
    }
    expect(
      BigInt(attack.rawDamage) + BigInt(attack.effectDamage) - BigInt(attack.effectiveDamage)
    ).toBe(BigInt(attack.overkillDamage));
    expect(JSON.parse(JSON.stringify(attack)).seasonTotalScore).toBe("18014398509481986");
  });

  it("forwards each scoreGained kind and each effect slot verbatim when null", async () => {
    AttackService.attack.mockResolvedValue({
      result: {
        ...attackResult,
        scoreGained: { direct: "300", assist: "0", relay: "0" },
        consumedEffect: null,
        createdEffect: null,
      },
      announcementQueued: false,
      latestReward: null,
    });
    const res = response();

    await publicHandler.attack(request({ body }), res);

    const { attack } = res.json.mock.calls[0][0];
    expect(attack.scoreGained).toEqual({ direct: "300", assist: "0", relay: "0" });
    expect(attack.consumedEffect).toBeNull();
    expect(attack.createdEffect).toBeNull();
    // No consumed effect means no name lookup at all.
    expect(UserModel.getDisplayNames).not.toHaveBeenCalled();
  });

  it("resolves a banner relay's assist and consumed effect source name in one lookup", async () => {
    AttackService.attack.mockResolvedValue({
      result: {
        ...attackResult,
        scoreGained: { direct: "200", assist: "7", relay: "7" },
        consumedEffect: { id: "9", type: "banner", value: "7", sourceUserId: "Usource" },
      },
      announcementQueued: false,
      latestReward: null,
    });
    const res = response();

    await publicHandler.attack(request({ body }), res);

    const { attack } = res.json.mock.calls[0][0];
    expect(attack.scoreGained).toEqual({ direct: "200", assist: "7", relay: "7" });
    expect(attack.consumedEffect).toEqual({
      id: "9",
      type: "banner",
      value: "7",
      sourceUserId: "Usource",
      sourceDisplayName: "留效果的人",
    });
    expect(UserModel.getDisplayNames).toHaveBeenCalledTimes(1);
    expect(UserModel.getDisplayNames).toHaveBeenCalledWith(["Usource"]);
  });

  it("degrades a consumed effect to a null display name when the profile read fails", async () => {
    UserModel.getDisplayNames.mockRejectedValue(new Error("db down"));
    const res = response();

    await publicHandler.attack(request({ body }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].attack.consumedEffect).toMatchObject({
      sourceUserId: "Usource",
      sourceDisplayName: null,
    });
  });

  it("never exposes the removed damage / wastedDamage aliases", async () => {
    const res = response();

    await publicHandler.attack(request({ body }), res);

    const { attack } = res.json.mock.calls[0][0];
    expect(Object.keys(attack)).not.toContain("damage");
    expect(Object.keys(attack)).not.toContain("wastedDamage");
  });

  it("still returns 200 with announcementQueued false when nothing was enqueued", async () => {
    AttackService.attack.mockResolvedValue({
      result: attackResult,
      announcementQueued: false,
      latestReward: null,
    });
    const res = response();

    await publicHandler.attack(request({ body }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].announcementQueued).toBe(false);
  });

  it("returns a usable response even when the follow-up status read fails", async () => {
    SeasonService.getBattleStatus.mockRejectedValue(new Error("db down"));
    const res = response();

    await publicHandler.attack(request({ body }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].status).toBeNull();
    expect(res.json.mock.calls[0][0].attack.effectiveDamage).toBe("400");
  });

  it.each([
    ["ROUND_NOT_FOUND", 409],
    ["ROUND_STALE", 409],
    ["ROUND_CLEARED", 409],
    ["NO_ACTIVE_SEASON", 409],
    ["SEASON_ENDED", 409],
    ["NO_ACTIVE_ROUND", 409],
    ["DAILY_LIMIT_EXCEEDED", 422],
    ["INVALID_ROUND_ID", 400],
    ["INVALID_ATTACK_TYPE", 400],
    ["INVALID_USER", 400],
    ["ATTACK_COOLDOWN", 429],
  ])("maps service failure %s to HTTP %i as stable JSON, never 500", async (code, statusCode) => {
    AttackService.attack.mockRejectedValue(error(code));
    const res = response();

    await publicHandler.attack(request({ body }), res);

    expect(res.status).toHaveBeenCalledWith(statusCode);
    expect(res.json).toHaveBeenCalledWith({ error: code });
  });

  it("maps an unexpected failure to 500 without leaking the message", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    AttackService.attack.mockRejectedValue(new Error("secret cookie=abc"));
    const res = response();

    await publicHandler.attack(request({ body }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "INTERNAL_ERROR" });
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
      { path: "/attack", methods: ["post"] },
    ]);
  });

  it("puts the attack route behind verifyToken like the rest of the public router", async () => {
    let isolated;
    jest.isolateModules(() => {
      const validation = require("../../../middleware/validation");
      validation.verifyPrivilege = jest.fn(() => (req, res, next) => next());
      const worldBossRouters = require("../../../router/WorldBoss");
      const api = require("../../../router/api");
      isolated = { api, validation, worldBossRouters };
    });

    const { api, validation, worldBossRouters } = isolated;
    const publicIndex = api.stack.findIndex(layer => layer.handle === worldBossRouters.public);
    const tokenIndex = api.stack
      .slice(0, publicIndex)
      .findLastIndex(layer => layer.handle === validation.verifyToken);

    expect(tokenIndex).toBeGreaterThanOrEqual(0);
    expect(publicIndex).toBeGreaterThan(tokenIndex);
    // Attack lives on that same guarded router, so it inherits the same gate.
    expect(
      worldBossRouters.public.stack.some(
        layer => layer.route && layer.route.path === "/attack" && layer.route.methods.post
      )
    ).toBe(true);
  });
});
