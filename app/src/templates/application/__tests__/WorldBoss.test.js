const config = require("config");
const WorldBoss = require("../WorldBoss");

function collectByKey(node, key, acc = []) {
  if (Array.isArray(node)) {
    node.forEach(item => collectByKey(item, key, acc));
  } else if (node && typeof node === "object") {
    for (const [entryKey, value] of Object.entries(node)) {
      if (entryKey === key && typeof value === "string") acc.push(value);
      collectByKey(value, key, acc);
    }
  }
  return acc;
}

function visibleCopy(node) {
  return collectByKey(node, "text").concat(collectByKey(node, "label")).join("\n");
}

function postbackActions(node) {
  const actions = [];
  function visit(value) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (value.type === "postback") actions.push(value);
      Object.values(value).forEach(visit);
    }
  }
  visit(node);
  return actions;
}

const LIFF = "https://liff.line.me/world-boss-liff?source=line";
const status = {
  season: { id: 9, name: "盛夏世界王", announcement: "全服討伐中" },
  round: { id: 21, round_no: 3, current_hp: 4500, max_hp: 12000 },
  boss: { id: 5, name: "暴君哥布林", description: "別讓牠逃走" },
};
const daily = { limit: 100, used: 20, remaining: 80 };
const latestReward = {
  rewardId: 42,
  seasonId: 8,
  seasonName: "春季世界王",
  ranking: 1,
  totalDamage: 987654,
  stoneAmount: 100,
  titleName: "殲滅之王",
  paidAt: "2026-07-20T12:34:56.000Z",
};

describe("WorldBoss Flex templates", () => {
  it("renders active round, HP, both attack actions, and a query-safe World Boss LIFF URI", () => {
    const bubble = WorldBoss.generateBattleStatusBubble({ ...status, daily, liffUri: LIFF });
    const copy = visibleCopy(bubble);
    const attacks = postbackActions(bubble).map(action => JSON.parse(action.data));

    expect(bubble.type).toBe("bubble");
    expect(copy).toContain("第 3 輪");
    expect(copy).toContain("4,500 / 12,000");
    expect(attacks).toEqual(
      expect.arrayContaining([
        {
          action: "worldBossAttack",
          attackType: "standard",
          cooldown: config.get("worldboss.attack_cooldown_seconds"),
        },
        {
          action: "worldBossAttack",
          attackType: "skill",
          cooldown: config.get("worldboss.attack_cooldown_seconds"),
        },
      ])
    );
    expect(collectByKey(bubble, "uri")).toContain(
      "https://liff.line.me/world-boss-liff/worldboss?source=line"
    );
  });

  it("rejects a zero max HP instead of serializing a NaN or Infinity percentage", () => {
    expect(() =>
      WorldBoss.generateBattleStatusBubble({
        ...status,
        round: { ...status.round, max_hp: 0 },
        daily,
        liffUri: LIFF,
      })
    ).toThrow("INVALID_MAX_HP");
  });

  it("renders every player-readable latest settlement field including ledger proof", () => {
    const bubble = WorldBoss.generateLatestRewardBubble({ reward: latestReward, liffUri: LIFF });
    const copy = visibleCopy(bubble);

    expect(bubble.type).toBe("bubble");
    expect(copy).toContain("春季世界王");
    expect(copy).toContain("第 1 名");
    expect(copy).toContain("100");
    expect(copy).toContain("殲滅之王");
    expect(copy).toContain("987,654");
    expect(copy).toContain("結算編號 #42");
    expect(copy).toContain("入帳時間 2026-07-20T12:34:56.000Z");
    expect(collectByKey(bubble, "uri")).toContain(
      "https://liff.line.me/world-boss-liff/worldboss?source=line"
    );
  });

  it("keeps the rank, zero stones, fallback title, and ledger proof for a zero-tier settlement", () => {
    const bubble = WorldBoss.generateLatestRewardBubble({
      reward: {
        ...latestReward,
        rewardId: 43,
        ranking: 88,
        stoneAmount: 0,
        titleName: null,
        paidAt: "2026-07-20T13:00:00.000Z",
      },
      liffUri: LIFF,
    });
    const copy = visibleCopy(bubble);

    expect(copy).toContain("第 88 名");
    expect(copy).toContain("0");
    expect(copy).toContain("無稱號");
    expect(copy).toContain("結算編號 #43");
    expect(copy).toContain("入帳時間 2026-07-20T13:00:00.000Z");
  });

  it("returns active status and a latest reward as two carousel bubbles", () => {
    const contents = WorldBoss.generateWorldBossReply({
      status,
      daily,
      latestReward,
      liffUri: LIFF,
    });

    expect(contents.type).toBe("carousel");
    expect(contents.contents).toHaveLength(2);
    expect(contents.contents.every(bubble => bubble.type === "bubble")).toBe(true);
  });

  it("returns the latest reward without an active season and a no-season bubble only when both are absent", () => {
    const rewardOnly = WorldBoss.generateWorldBossReply({ daily, latestReward, liffUri: LIFF });
    const noSeason = WorldBoss.generateWorldBossReply({ daily, liffUri: LIFF });

    expect(rewardOnly.type).toBe("bubble");
    expect(visibleCopy(rewardOnly)).toContain("結算編號 #42");
    expect(noSeason.type).toBe("bubble");
    expect(visibleCopy(noSeason)).toContain("目前沒有進行中的世界王賽季");
  });

  it("renders an attack result with damage, daily balance, and any cleared rounds", () => {
    const bubble = WorldBoss.generateAttackResultBubble({
      result: {
        damage: 1200,
        cost: 15,
        seasonTotalDamage: 12000,
        clearedRounds: [2, 3],
        levelResult: { levelUp: true, newLevel: 6, levelUpCount: 1 },
      },
      daily,
      latestReward,
    });
    const copy = visibleCopy(bubble);

    expect(bubble.type).toBe("bubble");
    expect(copy).toContain("1,200");
    expect(copy).toContain("80");
    expect(copy).toContain("第 2、3 輪");
    expect(copy).toContain("Lv.6");
  });

  it("marks the no-active-season card as ended when the supplied status says so", () => {
    const bubble = WorldBoss.generateNoActiveSeasonBubble({ ended: true, liffUri: LIFF });

    expect(visibleCopy(bubble)).toContain("世界王賽季已結束");
    expect(collectByKey(bubble, "uri")).toContain(
      "https://liff.line.me/world-boss-liff/worldboss?source=line"
    );
  });
});
