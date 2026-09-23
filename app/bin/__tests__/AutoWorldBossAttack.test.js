// AutoWorldBossAttack cron — unit tests covering target picking (lowest HP),
// quota-authoritative spending (remaining only, ignoring manual usage already made),
// skill→standard fallback, ROUND_CLEARED re-pick, DAILY_LIMIT_EXCEEDED per-user stop,
// NO_ACTIVE_SEASON batch abort, and ineligible-user skip.

jest.mock("config", () => {
  const store = {
    "worldboss.daily_cost_limit": 100,
  };
  return { get: jest.fn(key => store[key]) };
});

jest.mock("../../src/service/SubscriptionService", () => ({
  hasEffect: jest.fn(),
}));
jest.mock("../../src/service/WorldBossSeasonService", () => ({
  getBattleStatus: jest.fn(),
}));
jest.mock("../../src/service/WorldBossBattleService", () => ({
  getRemainingDailyCost: jest.fn(),
}));
jest.mock("../../src/service/WorldBossAttackService", () => ({
  autoAttack: jest.fn(),
  resolveCosts: jest.fn(),
}));
jest.mock("../../src/service/MinigameService", () => ({
  findByUserId: jest.fn(),
}));
jest.mock("../../src/service/EquipmentService", () => ({
  getEquipmentBonuses: jest.fn(),
}));
jest.mock("../../src/model/application/WorldBossRound", () => ({
  listCurrentCycle: jest.fn(),
}));

const mysql = require("../../src/util/mysql");
const SubscriptionService = require("../../src/service/SubscriptionService");
const SeasonService = require("../../src/service/WorldBossSeasonService");
const BattleService = require("../../src/service/WorldBossBattleService");
const AttackService = require("../../src/service/WorldBossAttackService");
const MinigameService = require("../../src/service/MinigameService");
const EquipmentService = require("../../src/service/EquipmentService");
const WorldBossRound = require("../../src/model/application/WorldBossRound");
const AutoWorldBossAttack = require("../../bin/AutoWorldBossAttack");

// The global qb mock (see __tests__/setup.js) doesn't include whereRaw in its chainable
// method list; loadTargets() needs it. Added once, never reset — it must survive every
// per-test mockReset() below (those only target the domain-service mocks).
if (!mysql.whereRaw) mysql.whereRaw = jest.fn().mockReturnValue(mysql);

function round(id, currentHp, { clearedAt = null } = {}) {
  return { id, current_hp: String(currentHp), cleared_at: clearedAt };
}

function err(code) {
  return Object.assign(new Error(code), { code });
}

// jest.clearAllMocks() only clears call history, not queued .mockResolvedValueOnce()
// implementations — a test that queues 3 "once" values but only consumes 2 leaks the
// 3rd into the next test. Every mock that any test drives with "Once" chains must be
// fully .mockReset() between tests, not just .mockClear()'d.
function resetDomainMocks() {
  SubscriptionService.hasEffect.mockReset();
  MinigameService.findByUserId.mockReset();
  EquipmentService.getEquipmentBonuses.mockReset();
  AttackService.resolveCosts.mockReset();
  AttackService.autoAttack.mockReset();
  BattleService.getRemainingDailyCost.mockReset();
  WorldBossRound.listCurrentCycle.mockReset();
  SeasonService.getBattleStatus.mockReset();
}

describe("AutoWorldBossAttack.pickLowestHpRound", () => {
  it("picks the uncleared round with the lowest current_hp", () => {
    const rounds = [round(1, 500), round(2, 100), round(3, 300)];
    expect(AutoWorldBossAttack.pickLowestHpRound(rounds)).toEqual(round(2, 100));
  });

  it("ignores cleared rounds even if their stored current_hp is stale/nonzero", () => {
    const rounds = [round(1, 50, { clearedAt: new Date() }), round(2, 200)];
    expect(AutoWorldBossAttack.pickLowestHpRound(rounds)).toEqual(round(2, 200));
  });

  it("ignores rounds already at 0 hp", () => {
    const rounds = [round(1, 0), round(2, 400)];
    expect(AutoWorldBossAttack.pickLowestHpRound(rounds)).toEqual(round(2, 400));
  });

  it("returns null when every round is cleared or 0 hp", () => {
    const rounds = [round(1, 0), round(2, 10, { clearedAt: new Date() })];
    expect(AutoWorldBossAttack.pickLowestHpRound(rounds)).toBeNull();
  });

  it("returns null for an empty/nullish rounds list", () => {
    expect(AutoWorldBossAttack.pickLowestHpRound([])).toBeNull();
    expect(AutoWorldBossAttack.pickLowestHpRound(undefined)).toBeNull();
  });
});

describe("AutoWorldBossAttack.attackForUser", () => {
  const SEASON_ID = 7;
  const target = { user_id: "Uworld", auto_world_boss_mode: "standard" };
  const counters = () => ({ hits: 0, usersAttacked: 0, usersSkipped: 0, usersFailed: 0 });

  beforeEach(() => {
    resetDomainMocks();
    SubscriptionService.hasEffect.mockResolvedValue(true);
    MinigameService.findByUserId.mockResolvedValue({ level: 5, job_key: "adventurer" });
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ cost_reduction: 0 });
    AttackService.resolveCosts.mockReturnValue({
      standardCost: 10,
      skillCost: 8,
      skillName: "奮力揮擊",
    });
    WorldBossRound.listCurrentCycle.mockResolvedValue({
      rounds: [round(1, 500), round(2, 100)],
    });
    AttackService.autoAttack.mockResolvedValue({ result: {} });
  });

  it("skips a user who is no longer eligible when re-checked right before attacking", async () => {
    SubscriptionService.hasEffect.mockResolvedValue(false);
    const c = counters();
    const outcome = await AutoWorldBossAttack.attackForUser(target, SEASON_ID, c);
    expect(outcome).toEqual({ abortBatch: false });
    expect(AttackService.autoAttack).not.toHaveBeenCalled();
    expect(c.usersSkipped).toBe(1);
  });

  it("re-picks the lowest-hp uncleared round on every hit, spending the remaining daily quota only", async () => {
    // Remaining decreases as we go: 25 -> 15 -> 5 (below standardCost=10, stops).
    BattleService.getRemainingDailyCost
      .mockResolvedValueOnce({ remaining: 25 })
      .mockResolvedValueOnce({ remaining: 15 })
      .mockResolvedValueOnce({ remaining: 5 });
    WorldBossRound.listCurrentCycle
      .mockResolvedValueOnce({ rounds: [round(1, 500), round(2, 100)] })
      .mockResolvedValueOnce({ rounds: [round(1, 500), round(2, 80)] });

    const c = counters();
    await AutoWorldBossAttack.attackForUser(target, SEASON_ID, c);

    expect(AttackService.autoAttack).toHaveBeenCalledTimes(2);
    expect(AttackService.autoAttack).toHaveBeenNthCalledWith(1, {
      userId: "Uworld",
      roundId: 2, // lowest hp round on first pick
      attackType: "standard",
    });
    expect(AttackService.autoAttack).toHaveBeenNthCalledWith(2, {
      userId: "Uworld",
      roundId: 2, // still lowest after the first hit dropped it further
      attackType: "standard",
    });
    expect(c.hits).toBe(2);
    expect(c.usersAttacked).toBe(1);
    // Only 3 quota checks: two successful hits, then the 25→15→5 check that stops the loop.
    expect(BattleService.getRemainingDailyCost).toHaveBeenCalledTimes(3);
  });

  it("stops entirely once remaining quota drops below the standard cost — ignores prior manual usage, only cares about what's left", async () => {
    // Whatever was used manually is already baked into "remaining" by BattleService —
    // this cron never reads "used", only "remaining".
    BattleService.getRemainingDailyCost.mockResolvedValueOnce({ remaining: 9 }); // < standardCost(10)
    const c = counters();
    await AutoWorldBossAttack.attackForUser(target, SEASON_ID, c);
    expect(AttackService.autoAttack).not.toHaveBeenCalled();
    expect(c.usersSkipped).toBe(1);
  });

  it("mode=skill uses skill attacks while quota covers the skill cost", async () => {
    const skillTarget = { user_id: "Uskill", auto_world_boss_mode: "skill" };
    AttackService.resolveCosts.mockReturnValue({ standardCost: 10, skillCost: 15, skillName: "x" });
    BattleService.getRemainingDailyCost
      .mockResolvedValueOnce({ remaining: 20 })
      .mockResolvedValueOnce({ remaining: 5 }); // < standardCost(10) too -> stop
    const c = counters();
    await AutoWorldBossAttack.attackForUser(skillTarget, SEASON_ID, c);

    expect(AttackService.autoAttack).toHaveBeenCalledTimes(1);
    expect(AttackService.autoAttack).toHaveBeenCalledWith(
      expect.objectContaining({ attackType: "skill" })
    );
  });

  it("mode=skill falls back to standard for the remaining hits once quota can't cover skill cost anymore", async () => {
    const skillTarget = { user_id: "Uskill", auto_world_boss_mode: "skill" };
    // skillCost=15, standardCost=10. remaining=20 covers skill; remaining=12 doesn't cover
    // skill but does cover standard; remaining=5 doesn't cover even standard -> stop.
    AttackService.resolveCosts.mockReturnValue({ standardCost: 10, skillCost: 15, skillName: "x" });
    BattleService.getRemainingDailyCost
      .mockResolvedValueOnce({ remaining: 20 })
      .mockResolvedValueOnce({ remaining: 12 })
      .mockResolvedValueOnce({ remaining: 5 });

    const c = counters();
    await AutoWorldBossAttack.attackForUser(skillTarget, SEASON_ID, c);

    expect(AttackService.autoAttack).toHaveBeenCalledTimes(2);
    expect(AttackService.autoAttack).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ attackType: "skill" })
    );
    expect(AttackService.autoAttack).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ attackType: "standard" })
    );
  });

  it("re-picks and retries (bounded) on ROUND_STALE / ROUND_CLEARED, then succeeds", async () => {
    BattleService.getRemainingDailyCost
      .mockResolvedValueOnce({ remaining: 30 })
      .mockResolvedValueOnce({ remaining: 5 }); // stop after the one successful hit
    AttackService.autoAttack
      .mockRejectedValueOnce(err("ROUND_STALE"))
      .mockRejectedValueOnce(err("ROUND_CLEARED"))
      .mockResolvedValueOnce({ result: {} });

    const c = counters();
    const outcome = await AutoWorldBossAttack.attackForUser(target, SEASON_ID, c);

    expect(outcome).toEqual({ abortBatch: false });
    expect(AttackService.autoAttack).toHaveBeenCalledTimes(3);
    expect(c.hits).toBe(1);
    expect(c.usersAttacked).toBe(1);
    expect(c.usersFailed).toBe(0);
  });

  it("gives up on this user (not the whole batch) once the retry bound is exhausted", async () => {
    BattleService.getRemainingDailyCost.mockResolvedValue({ remaining: 30 });
    AttackService.autoAttack.mockRejectedValue(err("ROUND_STALE"));

    const c = counters();
    const outcome = await AutoWorldBossAttack.attackForUser(target, SEASON_ID, c);

    expect(outcome).toEqual({ abortBatch: false });
    expect(c.hits).toBe(0);
    expect(c.usersSkipped).toBe(1);
    // Bounded retry: not an infinite loop despite an infinitely-failing mock.
    expect(AttackService.autoAttack.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("DAILY_LIMIT_EXCEEDED stops this user only, batch continues (abortBatch: false)", async () => {
    BattleService.getRemainingDailyCost
      .mockResolvedValueOnce({ remaining: 30 })
      .mockResolvedValueOnce({ remaining: 20 });
    AttackService.autoAttack
      .mockResolvedValueOnce({ result: {} })
      .mockRejectedValueOnce(err("DAILY_LIMIT_EXCEEDED"));

    const c = counters();
    const outcome = await AutoWorldBossAttack.attackForUser(target, SEASON_ID, c);

    expect(outcome).toEqual({ abortBatch: false });
    expect(c.hits).toBe(1);
    expect(c.usersAttacked).toBe(1);
    expect(c.usersFailed).toBe(0);
  });

  it.each(["NO_ACTIVE_SEASON", "SEASON_ENDED", "NO_ACTIVE_ROUND"])(
    "%s aborts the whole batch (abortBatch: true) instead of just skipping this user",
    async code => {
      BattleService.getRemainingDailyCost.mockResolvedValue({ remaining: 30 });
      AttackService.autoAttack.mockRejectedValue(err(code));

      const c = counters();
      const outcome = await AutoWorldBossAttack.attackForUser(target, SEASON_ID, c);

      expect(outcome).toEqual({ abortBatch: true, error: code });
    }
  );

  it("no uncleared round left at all (all cleared) also aborts the batch with NO_ACTIVE_ROUND", async () => {
    BattleService.getRemainingDailyCost.mockResolvedValueOnce({ remaining: 30 });
    WorldBossRound.listCurrentCycle.mockResolvedValueOnce({
      rounds: [round(1, 0), round(2, 0, { clearedAt: new Date() })],
    });

    const c = counters();
    const outcome = await AutoWorldBossAttack.attackForUser(target, SEASON_ID, c);

    expect(outcome).toEqual({ abortBatch: true, error: "NO_ACTIVE_ROUND" });
  });

  it("other/unclassified errors log and move on to the next user without aborting the batch", async () => {
    BattleService.getRemainingDailyCost.mockResolvedValueOnce({ remaining: 30 });
    AttackService.autoAttack.mockRejectedValueOnce(new Error("mysterious failure"));

    const c = counters();
    const outcome = await AutoWorldBossAttack.attackForUser(target, SEASON_ID, c);

    expect(outcome).toEqual({ abortBatch: false });
    expect(c.usersFailed).toBe(1);
  });
});

describe("AutoWorldBossAttack.impl.loadTargets — query shape", () => {
  it("joins subscribe_user/subscribe_card, LEFT JOINs preference, and defaults auto_world_boss to enabled via COALESCE", async () => {
    mysql.mockClear();
    mysql.distinct.mockResolvedValueOnce([]);
    await AutoWorldBossAttack.loadTargets();

    expect(mysql).toHaveBeenCalledWith("subscribe_user as su");
    expect(mysql.innerJoin).toHaveBeenCalledWith(
      "subscribe_card as sc",
      "su.subscribe_card_key",
      "sc.key"
    );
    expect(mysql.leftJoin).toHaveBeenCalledWith(
      "user_auto_preference as uap",
      "uap.user_id",
      "su.user_id"
    );
    const rawCalls = mysql.whereRaw.mock.calls.map(c => c[0]);
    expect(rawCalls.some(sql => sql.includes("COALESCE(uap.auto_world_boss, 1) = 1"))).toBe(true);
    expect(
      rawCalls.some(sql => sql.includes("auto_world_boss") && sql.includes("JSON_SEARCH"))
    ).toBe(true);
  });
});

describe("AutoWorldBossAttack.main — batch orchestration", () => {
  beforeEach(() => {
    resetDomainMocks();
    SeasonService.getBattleStatus.mockResolvedValue({
      ended: false,
      season: { id: 1 },
    });
    SubscriptionService.hasEffect.mockResolvedValue(true);
    MinigameService.findByUserId.mockResolvedValue({ level: 5, job_key: "adventurer" });
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ cost_reduction: 0 });
    AttackService.resolveCosts.mockReturnValue({ standardCost: 10, skillCost: 8, skillName: "x" });
    BattleService.getRemainingDailyCost.mockResolvedValue({ remaining: 5 }); // no hits, fast path
    WorldBossRound.listCurrentCycle.mockResolvedValue({ rounds: [] });
    mysql.distinct.mockReset().mockResolvedValue([]);
  });

  it("aborts the batch immediately (no target processing) when there is no active season", async () => {
    SeasonService.getBattleStatus.mockResolvedValueOnce(null);
    mysql.distinct.mockResolvedValueOnce([{ user_id: "Ua" }]);

    await AutoWorldBossAttack();

    expect(AttackService.autoAttack).not.toHaveBeenCalled();
  });

  it("aborts the batch immediately when the active season has already ended", async () => {
    SeasonService.getBattleStatus.mockResolvedValueOnce({ ended: true, season: { id: 1 } });
    mysql.distinct.mockResolvedValueOnce([{ user_id: "Ua" }]);

    await AutoWorldBossAttack();

    expect(AttackService.autoAttack).not.toHaveBeenCalled();
  });

  it("processes users sequentially and stops the whole run when a user hits an abort-batch error", async () => {
    mysql.distinct.mockResolvedValueOnce([
      { user_id: "Ufirst", auto_world_boss_mode: "standard" },
      { user_id: "Usecond", auto_world_boss_mode: "standard" },
    ]);
    BattleService.getRemainingDailyCost.mockResolvedValue({ remaining: 30 });
    WorldBossRound.listCurrentCycle.mockResolvedValue({ rounds: [round(1, 100)] });
    AttackService.autoAttack.mockRejectedValue(err("NO_ACTIVE_SEASON"));

    await AutoWorldBossAttack();

    // First user's attack triggers the abort; the second user must never be reached.
    expect(AttackService.autoAttack).toHaveBeenCalledTimes(1);
  });

  it("a second concurrent invocation while one run is in-flight is a no-op (running guard)", async () => {
    let resolveGate;
    SeasonService.getBattleStatus.mockImplementationOnce(
      () => new Promise(resolve => (resolveGate = resolve))
    );
    mysql.distinct.mockResolvedValue([]);

    const first = AutoWorldBossAttack();
    const second = AutoWorldBossAttack(); // should return immediately, no-op
    resolveGate({ ended: false, season: { id: 1 } });
    await Promise.all([first, second]);

    expect(SeasonService.getBattleStatus).toHaveBeenCalledTimes(1);
  });
});
