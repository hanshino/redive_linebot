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

function detailRowValue(node, label) {
  const rows = [];
  function visit(value) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (
        value.type === "box" &&
        value.layout === "horizontal" &&
        Array.isArray(value.contents) &&
        value.contents[0] &&
        value.contents[0].text === label
      ) {
        rows.push(value.contents[1] && value.contents[1].text);
      }
      Object.values(value).forEach(visit);
    }
  }
  visit(node);
  return rows;
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
    expect(detailRowValue(bubble, "今日行動額度")).toEqual(["80"]);
    expect(detailRowValue(bubble, "今日已消耗額度")).toEqual(["20 / 100"]);
    expect(copy).not.toContain("今日可用女神石");
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

  it("rejects non-HTTPS LIFF URIs rather than serializing invalid URI actions", () => {
    expect(() =>
      WorldBoss.generateBattleStatusBubble({ ...status, daily, liffUri: "ftp://liff.line.me/id" })
    ).toThrow("INVALID_LIFF_URI");
  });

  it("caps an unbounded boss description within LINE bubble and carousel payload limits", () => {
    const oversizedStatus = {
      ...status,
      boss: { ...status.boss, description: "超長描述".repeat(22000) },
    };
    const bubble = WorldBoss.generateBattleStatusBubble({
      ...oversizedStatus,
      daily,
      liffUri: LIFF,
    });
    const carousel = WorldBoss.generateWorldBossReply({
      status: oversizedStatus,
      daily,
      latestReward,
      liffUri: LIFF,
    });

    expect(visibleCopy(bubble)).toContain("…");
    expect(Buffer.byteLength(JSON.stringify(bubble), "utf8")).toBeLessThanOrEqual(30 * 1024);
    expect(Buffer.byteLength(JSON.stringify(carousel), "utf8")).toBeLessThanOrEqual(50 * 1024);
  });

  it("preserves BIGINT HP strings while calculating a safe progress percentage", () => {
    const bubble = WorldBoss.generateBattleStatusBubble({
      ...status,
      round: {
        ...status.round,
        current_hp: "4503599627370497",
        max_hp: "9007199254740993",
      },
      daily,
      liffUri: LIFF,
    });

    expect(visibleCopy(bubble)).toContain(
      "HP 4,503,599,627,370,497 / 9,007,199,254,740,993（50%）"
    );
  });

  it("preserves aggregate integer strings above Number.MAX_SAFE_INTEGER", () => {
    const bubble = WorldBoss.generateLatestRewardBubble({
      reward: { ...latestReward, totalDamage: "9007199254740993" },
      liffUri: LIFF,
    });

    expect(detailRowValue(bubble, "賽季總傷害")).toEqual(["9,007,199,254,740,993"]);
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
    expect(detailRowValue(bubble, "女神石")).toEqual(["0"]);
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

  it("renders attack quota copy and the complete latest settlement proof as a carousel", () => {
    const reply = WorldBoss.generateAttackResultBubble({
      result: {
        damage: 1200,
        cost: 15,
        seasonTotalDamage: 12000,
        clearedRounds: [2, 3],
        levelResult: { levelUp: true, newLevel: 6, levelUpCount: 1 },
      },
      daily,
      latestReward,
      liffUri: LIFF,
    });
    const attackBubble = reply.contents[0];
    const rewardBubble = reply.contents[1];
    const attackCopy = visibleCopy(attackBubble);
    const rewardCopy = visibleCopy(rewardBubble);

    expect(reply.type).toBe("carousel");
    expect(reply.contents).toHaveLength(2);
    expect(attackCopy).toContain("1,200");
    expect(detailRowValue(attackBubble, "消耗攻擊 cost")).toEqual(["15"]);
    expect(detailRowValue(attackBubble, "今日剩餘行動額度")).toEqual(["80"]);
    expect(attackCopy).not.toContain("女神石");
    expect(attackCopy).toContain("第 2、3 輪");
    expect(attackCopy).toContain("Lv.6");
    expect(rewardCopy).toContain("春季世界王");
    expect(rewardCopy).toContain("第 1 名");
    expect(detailRowValue(rewardBubble, "女神石")).toEqual(["100"]);
    expect(rewardCopy).toContain("殲滅之王");
    expect(rewardCopy).toContain("987,654");
    expect(rewardCopy).toContain("結算編號 #42");
    expect(rewardCopy).toContain("入帳時間 2026-07-20T12:34:56.000Z");
    expect(collectByKey(rewardBubble, "uri")).toContain(
      "https://liff.line.me/world-boss-liff/worldboss?source=line"
    );
  });

  it("keeps a successful attack without a latest settlement as one valid bubble", () => {
    const reply = WorldBoss.generateAttackResultBubble({
      result: {
        damage: 1,
        cost: 1,
        seasonTotalDamage: 1,
        clearedRounds: [],
        levelResult: { levelUp: false },
      },
      daily,
      latestReward: null,
      liffUri: LIFF,
    });

    expect(reply.type).toBe("bubble");
    expect(detailRowValue(reply, "消耗攻擊 cost")).toEqual(["1"]);
  });

  it("bounds a 5,000-round attack summary within LINE bubble and carousel limits", () => {
    const clearedRounds = Array.from({ length: 5000 }, (_, index) => index + 1);
    const reply = WorldBoss.generateAttackResultBubble({
      result: {
        damage: 5000,
        cost: 1,
        seasonTotalDamage: 5000,
        clearedRounds,
        levelResult: { levelUp: false },
      },
      daily,
      latestReward,
      liffUri: LIFF,
    });
    const attackBubble = reply.contents[0];
    const copy = visibleCopy(attackBubble);

    expect(copy).toContain("共 5,000 輪");
    expect(copy).toContain("第 1、2、3 輪");
    expect(copy).toContain("第 4,998、4,999、5,000 輪");
    expect(Buffer.byteLength(JSON.stringify(attackBubble), "utf8")).toBeLessThanOrEqual(30 * 1024);
    expect(Buffer.byteLength(JSON.stringify(reply), "utf8")).toBeLessThanOrEqual(50 * 1024);
  });

  it("marks the no-active-season card as ended when the supplied status says so", () => {
    const bubble = WorldBoss.generateNoActiveSeasonBubble({ ended: true, liffUri: LIFF });

    expect(visibleCopy(bubble)).toContain("世界王賽季已結束");
    expect(collectByKey(bubble, "uri")).toContain(
      "https://liff.line.me/world-boss-liff/worldboss?source=line"
    );
  });
});
