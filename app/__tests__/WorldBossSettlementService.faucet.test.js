"use strict";

jest.mock("config");

const config = require("config");

const CFG = {
  "worldboss.reward.participation": 15,
  "worldboss.reward.expired_participation": 5,
  "worldboss.reward.rank_bands.p1": 50,
  "worldboss.reward.rank_bands.p5": 35,
  "worldboss.reward.rank_bands.p20": 20,
  "worldboss.reward.rank_bands.rest": 8,
  "worldboss.reward.mvp_stones": 30,
};

beforeEach(() => {
  jest.clearAllMocks();
  config.get = jest.fn(key => {
    if (key in CFG) return CFG[key];
    throw new Error(`unexpected config key ${key}`);
  });
});

const Settlement = require("../src/service/WorldBossSettlementService");

describe("_computeFaucet", () => {
  test("expired day: everyone gets expired_participation only, no rank/mvp/stones", () => {
    const out = Settlement._computeFaucet({
      dpsBoard: [{ user_id: 1, platform_id: "U1", total_damage: 9000 }],
      healerBoard: [{ user_id: 2, platform_id: "U2", total_contribution: 40 }],
      tankBoard: [],
      isExpired: true,
      supportRatio: 0.3,
    });
    const u1 = out.perUser.get(1);
    expect(u1).toEqual({ materials: 5, stones: 0, board: "dps", rank: null, isMvp: false });
    const u2 = out.perUser.get(2);
    expect(u2.materials).toBe(5);
    expect(u2.isMvp).toBe(false);
    expect(out.dpsMvpNumericId).toBeNull();
  });

  test("killed day: dps rank-1 gets base+p1 band + mvp stones, is dpsMvp", () => {
    // 100 dps players -> #1 top1% (p1), #2-5 top5% (p5), #6-20 top20% (p20), rest.
    const dpsBoard = [];
    for (let i = 0; i < 100; i++) {
      dpsBoard.push({ user_id: i + 1, platform_id: `U${i + 1}`, total_damage: (100 - i) * 10 });
    }
    const out = Settlement._computeFaucet({
      dpsBoard,
      healerBoard: [],
      tankBoard: [],
      isExpired: false,
      supportRatio: 0.3, // healthy -> no premium, but no support board here anyway
    });
    const top = out.perUser.get(1);
    expect(top.materials).toBe(15 + 50); // base + p1
    expect(top.stones).toBe(30); // dps mvp stones (positive grant)
    expect(top.isMvp).toBe(true);
    expect(top.rank).toBe(1);
    expect(out.dpsMvpNumericId).toBe(1);

    const second = out.perUser.get(2);
    expect(second.materials).toBe(15 + 35); // p5 band (rank 2 of 100 = top5%)
    expect(second.stones).toBe(0);
    expect(second.isMvp).toBe(false);

    const last = out.perUser.get(100);
    expect(last.materials).toBe(15 + 8); // rest band
  });

  test("scarcity premium uses shared getSupportRatio: at ratio->0 the healer band bonus is x3", () => {
    const dpsBoard = [];
    for (let i = 0; i < 30; i++) {
      dpsBoard.push({ user_id: i + 1, platform_id: `U${i + 1}`, total_damage: 100 });
    }
    const healerBoard = [
      { user_id: 201, platform_id: "U201", total_contribution: 50 }, // rank 1/2 -> p1=50
      { user_id: 202, platform_id: "U202", total_contribution: 10 }, // rank 2/2 -> rest=8
    ];
    // cold-start support ratio (almost no support actions) -> multiplier clamps to 3x.
    const out = Settlement._computeFaucet({
      dpsBoard,
      healerBoard,
      tankBoard: [],
      isExpired: false,
      supportRatio: 0.01,
    });
    const h1 = out.perUser.get(201);
    // base 15 + (band 50 * 3x scarcity) = 165, healer mvp (no stones - stones only dps)
    expect(h1.materials).toBe(15 + 150);
    expect(h1.board).toBe("healer");
    expect(h1.isMvp).toBe(true);
    expect(h1.stones).toBe(0);
    const h2 = out.perUser.get(202);
    expect(h2.materials).toBe(15 + 8 * 3); // rest band * 3x scarcity
  });

  test("healthy support ratio (>= target share) gives no premium (x1)", () => {
    const healerBoard = [{ user_id: 201, platform_id: "U201", total_contribution: 50 }];
    const out = Settlement._computeFaucet({
      dpsBoard: [{ user_id: 1, platform_id: "U1", total_damage: 100 }],
      healerBoard,
      tankBoard: [],
      isExpired: false,
      supportRatio: 0.5, // above the 0.3 target -> multiplier clamps to 1
    });
    // rank 1/1 healer -> p1=50 band, x1 -> base 15 + 50
    expect(out.perUser.get(201).materials).toBe(15 + 50);
  });

  test("multi-board player assigned to single best board", () => {
    // user 1 on dps (damage 1000) and healer (contribution 5) -> best = dps.
    const out = Settlement._computeFaucet({
      dpsBoard: [{ user_id: 1, platform_id: "U1", total_damage: 1000 }],
      healerBoard: [{ user_id: 1, platform_id: "U1", total_contribution: 5 }],
      tankBoard: [],
      isExpired: false,
      supportRatio: 0.3,
    });
    expect(out.perUser.size).toBe(1);
    expect(out.perUser.get(1).board).toBe("dps");
  });
});
