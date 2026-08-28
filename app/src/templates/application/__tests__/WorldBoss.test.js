const WorldBoss = require("../WorldBoss");

function text(node) {
  if (Array.isArray(node)) return node.flatMap(text);
  if (!node || typeof node !== "object") return [];
  return [
    ...(typeof node.text === "string" ? [node.text] : []),
    ...Object.values(node).flatMap(text),
  ];
}

function actions(node) {
  if (Array.isArray(node)) return node.flatMap(actions);
  if (!node || typeof node !== "object") return [];
  return [...(node.type === "postback" ? [node] : []), ...Object.values(node).flatMap(actions)];
}

function uriActions(node) {
  if (Array.isArray(node)) return node.flatMap(uriActions);
  if (!node || typeof node !== "object") return [];
  return [...(node.type === "uri" ? [node] : []), ...Object.values(node).flatMap(uriActions)];
}

function images(node) {
  if (Array.isArray(node)) return node.flatMap(images);
  if (!node || typeof node !== "object") return [];
  return [...(node.type === "image" ? [node] : []), ...Object.values(node).flatMap(images)];
}

const LIFF = "https://liff.line.me/world-boss-liff?source=line";
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

function makeStatus({ cleared = [], image = () => null } = {}) {
  return {
    season: { id: 9, name: "盛夏世界王", announcement: "全服討伐中" },
    cycleNo: 3,
    rounds: [1, 2, 3, 4, 5].map(position => ({
      id: 20 + position,
      season_id: 9,
      season_boss_id: 30 + position,
      cycle_no: 3,
      position,
      world_boss_id: 40 + position,
      name: `王${position}`,
      image: image(position),
      description: `描述${position}`,
      hp_weight: "1.00",
      max_hp: "12000",
      current_hp: cleared.includes(position) ? "0" : String(12000 - position * 1000),
      cleared_at: cleared.includes(position) ? new Date("2026-07-20T12:00:00.000Z") : null,
    })),
    ended: false,
  };
}

const httpsImage = position => `https://cdn.example.com/boss/${position}.png`;

describe("WorldBoss Flex production contract", () => {
  it("renders exactly five public bubbles in position order with only the shared LIFF uri", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus(),
      liffUri: LIFF,
    });
    expect(reply.type).toBe("carousel");
    expect(reply.contents).toHaveLength(5);
    expect(reply.contents.map(bubble => text(bubble).find(value => value.includes("號")))).toEqual([
      "第 3 輪 · 1 號 · 王1",
      "第 3 輪 · 2 號 · 王2",
      "第 3 輪 · 3 號 · 王3",
      "第 3 輪 · 4 號 · 王4",
      "第 3 輪 · 5 號 · 王5",
    ]);
    // 預設關閉時群組卡不得有 postback。
    expect(actions(reply)).toEqual([]);
    const uris = uriActions(reply);
    expect(uris).toHaveLength(5);
    expect(new Set(uris.map(action => action.uri)).size).toBe(1);
    expect(new URL(uris[0].uri).pathname.endsWith("/worldboss")).toBe(true);
  });

  it("renders attack postbacks only when enabled, without personal identity data", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ cleared: [2] }),
      liffUri: LIFF,
      attackEnabled: true,
    });

    reply.contents.forEach((bubble, index) => {
      const postbacks = actions(bubble);
      if (index === 1) {
        expect(postbacks).toHaveLength(0);
        return;
      }
      expect(postbacks).toHaveLength(2);
      expect(postbacks.map(action => JSON.parse(action.data))).toEqual([
        { action: "worldBossAttack", roundId: 21 + index, attackType: "standard" },
        { action: "worldBossAttack", roundId: 21 + index, attackType: "skill" },
      ]);
      postbacks.forEach(action => {
        expect(JSON.parse(action.data)).not.toHaveProperty("userId");
      });
      expect(uriActions(bubble)).toHaveLength(1);
    });
  });

  it("excludes every personal field from the public board", () => {
    const values = text(
      WorldBoss.generateWorldBossReply({
        status: makeStatus(),
        liffUri: LIFF,
        attackEnabled: true,
      })
    ).join("|");

    for (const forbidden of [
      "今日行動額度",
      "今日已消耗額度",
      "剩餘",
      "EXP",
      "女神石",
      "稱號",
      "結算",
      "賽季累積傷害",
      "春季世界王",
    ]) {
      expect(values).not.toContain(forbidden);
    }
  });

  it("ignores a settled reward and never renders a reward bubble in the group reply", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus(),
      latestReward,
      liffUri: LIFF,
    });

    expect(reply.contents).toHaveLength(5);
    expect(text(reply).join("|")).not.toContain("春季世界王");
  });

  it("shows cleared bosses without any action at all", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ cleared: [2, 5] }),
      liffUri: LIFF,
    });
    expect(reply.contents[1]).toMatchObject({ type: "bubble" });
    expect(reply.contents[1].footer.contents).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "已擊破" })])
    );
    expect(actions(reply.contents[1])).toHaveLength(0);
    expect(uriActions(reply.contents[1])).toHaveLength(0);
    expect(uriActions(reply.contents[0])).toHaveLength(1);
  });

  it("falls back to the no-season bubble instead of a reward bubble", () => {
    const reply = WorldBoss.generateWorldBossReply({ latestReward, liffUri: LIFF });
    expect(reply.type).toBe("bubble");
    expect(text(reply).join()).toContain("目前沒有進行中的世界王賽季");
    expect(text(reply).join()).not.toContain("春季世界王");
    expect(
      text(WorldBoss.generateNoActiveSeasonBubble({ ended: true, liffUri: LIFF })).join()
    ).toContain("世界王賽季已結束");
  });

  it("gives each bubble the hero image from its own snapshot url", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ image: httpsImage }),
      liffUri: LIFF,
    });

    expect(reply.contents).toHaveLength(5);
    expect(reply.contents.map(bubble => bubble.hero.url)).toEqual([1, 2, 3, 4, 5].map(httpsImage));
    reply.contents.forEach(bubble => {
      expect(bubble.hero).toMatchObject({ type: "image", size: "full", aspectMode: "cover" });
    });
    // Position order still holds, so art and name never belong to different bosses.
    expect(reply.contents.map(bubble => text(bubble).find(value => value.includes("號")))).toEqual([
      "第 3 輪 · 1 號 · 王1",
      "第 3 輪 · 2 號 · 王2",
      "第 3 輪 · 3 號 · 王3",
      "第 3 輪 · 4 號 · 王4",
      "第 3 輪 · 5 號 · 王5",
    ]);
  });

  it("keeps a cleared boss's art while dimming it, and leaves live bosses undimmed", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ cleared: [2], image: httpsImage }),
      liffUri: LIFF,
    });
    const clearedHero = reply.contents[1].hero;

    expect(images(clearedHero).map(image => image.url)).toEqual([httpsImage(2)]);
    expect(clearedHero.contents.some(node => node.backgroundColor)).toBe(true);
    // Flex images have no opacity property; the veil must be a real box.
    expect(images(clearedHero).every(image => image.opacity === undefined)).toBe(true);
    expect(actions(reply.contents[1])).toHaveLength(0);
    expect(reply.contents[0].hero).toMatchObject({ type: "image", url: httpsImage(1) });
  });

  it.each([
    ["null", () => null],
    ["undefined", () => undefined],
    ["empty string", () => ""],
    ["whitespace", () => "   "],
    ["plain http", position => `http://cdn.example.com/boss/${position}.png`],
    ["protocol-relative", position => `//cdn.example.com/boss/${position}.png`],
    ["a bare path", position => `/boss/${position}.png`],
    ["a non-url string", () => "not a url"],
    ["a javascript url", () => "javascript:alert(1)"],
    ["a data url", () => "data:image/png;base64,iVBORw0KGgo="],
    ["a non-string", () => 12345],
  ])("omits the hero entirely when the snapshot image is %s", (_label, image) => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ cleared: [4], image }),
      liffUri: LIFF,
    });

    expect(reply.contents).toHaveLength(5);
    reply.contents.forEach(bubble => {
      expect(bubble).not.toHaveProperty("hero");
      expect(images(bubble)).toEqual([]);
    });
    // The text card still renders in full, so nothing is lost by dropping the image.
    expect(text(reply.contents[0]).some(value => value.includes("王1"))).toBe(true);
  });

  it("renders a mixed roster where only some bosses have usable art", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({
        image: position => (position % 2 === 1 ? httpsImage(position) : "http://insecure/x.png"),
      }),
      liffUri: LIFF,
    });

    expect(reply.contents.map(bubble => bubble.hero?.url)).toEqual([
      httpsImage(1),
      undefined,
      httpsImage(3),
      undefined,
      httpsImage(5),
    ]);
  });

  it("stays a valid five-bubble carousel within LINE's payload limit when every boss has art", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ image: position => `${httpsImage(position)}?${"v".repeat(200)}` }),
      liffUri: LIFF,
    });

    expect(reply.type).toBe("carousel");
    expect(reply.contents).toHaveLength(5);
    expect(reply.contents.every(bubble => bubble.size === "kilo")).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(reply), "utf8")).toBeLessThan(50 * 1024);
    // Every image node must be a well-formed https url, or LINE rejects the message.
    images(reply).forEach(image => {
      expect(new URL(image.url).protocol).toBe("https:");
    });
  });
});
