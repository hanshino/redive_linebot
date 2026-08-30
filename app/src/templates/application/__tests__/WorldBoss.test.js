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

function nodesOfType(node, type) {
  if (Array.isArray(node)) return node.flatMap(child => nodesOfType(child, type));
  if (!node || typeof node !== "object") return [];
  return [
    ...(node.type === type ? [node] : []),
    ...Object.values(node).flatMap(child => nodesOfType(child, type)),
  ];
}

function gradients(node) {
  return nodesOfType(node, "linearGradient");
}

/** The single text node that carries the big HP percentage, built from two spans. */
function percentNode(node) {
  return nodesOfType(node, "text").find(
    item => Array.isArray(item.contents) && item.contents.some(span => span.text === "%")
  );
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

function makeRound(overrides = {}) {
  return {
    id: 21,
    cycle_no: 3,
    position: 1,
    name: "王1",
    image: httpsImage(1),
    description: "描述",
    max_hp: "12000",
    current_hp: "6000",
    cleared_at: null,
    ...overrides,
  };
}

function bubbleFor(overrides = {}, options = {}) {
  const round = makeRound(overrides);
  return WorldBoss.generateBattleStatusBubble({
    season: { id: 9, name: "盛夏世界王" },
    round,
    boss: round,
    liffUri: LIFF,
    ...options,
  });
}

describe("WorldBoss Flex production contract", () => {
  it("renders exactly five public bubbles in position order with only the shared LIFF uri", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus(),
      liffUri: LIFF,
    });
    expect(reply.type).toBe("carousel");
    expect(reply.contents).toHaveLength(5);
    expect(reply.contents.map(bubble => text(bubble).find(value => value.includes("號")))).toEqual([
      "第 3 輪 · 1 號",
      "第 3 輪 · 2 號",
      "第 3 輪 · 3 號",
      "第 3 輪 · 4 號",
      "第 3 輪 · 5 號",
    ]);
    // 名稱與輪次標籤拆開後，名稱仍必須跟著自己的位置走。
    expect(reply.contents.map(bubble => text(bubble).find(value => /^王\d$/.test(value)))).toEqual([
      "王1",
      "王2",
      "王3",
      "王4",
      "王5",
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

  it.each([
    [{ banner: 1, seal: 2 }, "待接力：鼓舞 ×1、魔力刻印 ×2"],
    [{ banner: 3, seal: 0 }, "待接力：鼓舞 ×3"],
    [{ banner: 0, seal: 4 }, "待接力：魔力刻印 ×4"],
  ])("renders pending effects as public shared state", (pending_effects, expected) => {
    expect(text(bubbleFor({ pending_effects }))).toContain(expected);
  });

  it("omits pending effects when empty or cleared", () => {
    expect(text(bubbleFor({ pending_effects: { banner: 0, seal: 0 } }))).not.toContain("待接力");
    expect(
      text(
        bubbleFor({
          current_hp: "0",
          cleared_at: new Date(),
          pending_effects: { banner: 9, seal: 9 },
        })
      )
    ).not.toContain("待接力");
  });

  it("weights the attack button above the skill button in the same row", () => {
    const footer = bubbleFor({}, { attackEnabled: true }).footer;
    const [row, board] = footer.contents;

    expect(row.layout).toBe("horizontal");
    expect(
      row.contents.map(button => [button.style, button.color, button.height, button.flex])
    ).toEqual([
      ["primary", "#DC2626", "sm", 3],
      ["primary", "#273246", "sm", 2],
    ]);
    // 戰況板是第三層級：純文字連結，不與兩顆攻擊鈕搶視覺權重。
    expect(board).toMatchObject({ type: "button", style: "link", color: "#8CC6FF" });
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

  it("shows cleared bosses with the board link but never an attack action", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ cleared: [2, 5] }),
      liffUri: LIFF,
      attackEnabled: true,
    });
    const cleared = reply.contents[1];

    expect(cleared).toMatchObject({ type: "bubble" });
    expect(text(cleared)).toContain("✓ 討伐完成");
    expect(actions(cleared)).toHaveLength(0);
    // 已擊破仍保留戰況板入口，玩家才看得到後續戰況。
    expect(uriActions(cleared)).toHaveLength(1);
    expect(cleared.footer.contents).toHaveLength(1);
    expect(cleared.footer.contents[0]).toMatchObject({ type: "box", borderWidth: "1px" });
    // 已擊破卡不再顯示血條或百分比。
    expect(percentNode(cleared)).toBeUndefined();
    expect(text(cleared).some(value => value.startsWith("0 / "))).toBe(true);
  });

  it("wraps the lone board link in an outline box when attacking is disabled", () => {
    const footer = bubbleFor({}, { attackEnabled: false }).footer;

    expect(footer.contents).toHaveLength(1);
    expect(footer.contents[0]).toMatchObject({
      type: "box",
      borderWidth: "1px",
      borderColor: "#FFFFFF29",
      cornerRadius: "6px",
    });
    expect(footer.contents[0].contents[0]).toMatchObject({ type: "button", style: "link" });
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

  it("gives the no-season bubble a gradient rule and an outlined board link", () => {
    const bubble = WorldBoss.generateNoActiveSeasonBubble({ ended: false, liffUri: LIFF });

    expect(bubble).not.toHaveProperty("hero");
    expect(bubble.body.contents[0]).toMatchObject({ height: "4px" });
    expect(gradients(bubble.body.contents[0])[0]).toMatchObject({
      angle: "90deg",
      startColor: "#DC2626",
      endColor: "#F59E0B",
    });
    expect(text(bubble)).toContain("敬請期待下一次全服討伐。");
    expect(bubble.footer.contents[0]).toMatchObject({ type: "box", borderColor: "#FFFFFF29" });
    expect(uriActions(bubble)).toHaveLength(1);
  });

  it("paints every surface dark so no bubble falls back to a white block", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ image: httpsImage }),
      liffUri: LIFF,
      attackEnabled: true,
    });

    [...reply.contents, WorldBoss.generateNoActiveSeasonBubble({ liffUri: LIFF })].forEach(
      bubble => {
        expect(bubble.styles.body.backgroundColor).toBe("#131822");
        expect(bubble.styles.footer.backgroundColor).toBe("#131822");
        expect(bubble.body.backgroundColor).toBe("#131822");
        expect(bubble.footer.backgroundColor).toBe("#131822");
      }
    );
  });

  it("gives each bubble the hero image from its own snapshot url", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ image: httpsImage }),
      liffUri: LIFF,
    });

    expect(reply.contents).toHaveLength(5);
    expect(reply.contents.map(bubble => images(bubble.hero)[0].url)).toEqual(
      [1, 2, 3, 4, 5].map(httpsImage)
    );
    reply.contents.forEach(bubble => {
      expect(images(bubble.hero)[0]).toMatchObject({
        type: "image",
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
      });
    });
    // Position order still holds, so art and name never belong to different bosses.
    expect(reply.contents.map(bubble => text(bubble).find(value => value.includes("號")))).toEqual([
      "第 3 輪 · 1 號",
      "第 3 輪 · 2 號",
      "第 3 輪 · 3 號",
      "第 3 輪 · 4 號",
      "第 3 輪 · 5 號",
    ]);
  });

  it("overlays the cycle label, boss name and a readability scrim on the hero art", () => {
    const hero = bubbleFor().hero;
    const overlays = hero.contents.slice(1);

    expect(hero.contents[0].type).toBe("image");
    expect(overlays.every(node => node.position === "absolute")).toBe(true);
    expect(gradients(hero)[0]).toMatchObject({
      angle: "0deg",
      startColor: "#131822",
      endColor: "#13182200",
    });
    expect(text(hero)).toEqual(expect.arrayContaining(["第 3 輪 · 1 號", "王1"]));
    // 名稱是卡面上最大的一行字。
    expect(nodesOfType(hero, "text").find(node => node.text === "王1")).toMatchObject({
      size: "xl",
      weight: "bold",
      color: "#FFFFFF",
    });
    // 沒有 hero 時標題才會回到 body，有 hero 就不該重複。
    expect(text(bubbleFor().body).filter(value => value === "王1")).toHaveLength(0);
  });

  it("keeps a cleared boss's art while dimming it, and leaves live bosses undimmed", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ cleared: [2], image: httpsImage }),
      liffUri: LIFF,
    });
    const clearedHero = reply.contents[1].hero;

    expect(images(clearedHero).map(image => image.url)).toEqual([httpsImage(2)]);
    expect(clearedHero.contents.some(node => node.backgroundColor === "#0A0F16D9")).toBe(true);
    // Flex images have no opacity property; the veil must be a real box.
    expect(images(clearedHero).every(image => image.opacity === undefined)).toBe(true);
    expect(text(clearedHero)).toContain("已擊破");
    expect(actions(reply.contents[1])).toHaveLength(0);

    const liveHero = reply.contents[0].hero;
    expect(liveHero.contents.some(node => node.backgroundColor === "#0A0F16D9")).toBe(false);
    expect(text(liveHero)).not.toContain("已擊破");
  });

  it.each([
    [100, "#4ADE80", "#15803D"],
    [61, "#4ADE80", "#15803D"],
    [60, "#FBBF24", "#B45309"],
    [31, "#FBBF24", "#B45309"],
    [30, "#FB7185", "#9F1239"],
    [1, "#FB7185", "#9F1239"],
  ])("colors the %s%% hp bar by tier", (percent, textColor, gradientFrom) => {
    const bubble = bubbleFor({ max_hp: "100", current_hp: String(percent) });
    const spans = percentNode(bubble).contents;

    expect(spans.map(span => span.text)).toEqual([String(percent), "%"]);
    expect(spans.map(span => [span.size, span.color])).toEqual([
      ["3xl", textColor],
      ["sm", textColor],
    ]);
    expect(gradients(bubble.body)[0]).toMatchObject({ angle: "90deg", startColor: gradientFrom });
  });

  it("keeps a sliver of hp bar visible for a boss that is nearly dead but still alive", () => {
    const bubble = bubbleFor({ max_hp: "100000", current_hp: "1" });
    const [track] = nodesOfType(bubble.body, "box").filter(node => node.height === "14px");

    expect(percentNode(bubble).contents[0].text).toBe("0");
    expect(track.contents[0].width).toBe("2%");
    // 還活著就不能顯示已討伐完成。
    expect(text(bubble)).not.toContain("✓ 討伐完成");
    expect(nodesOfType(bubble.body, "box").find(node => node.width === "50%")).toBeUndefined();
  });

  it("computes the hp percentage with BigInt so string columns keep full precision", () => {
    const bubble = bubbleFor({
      max_hp: "10000000000000000001",
      current_hp: "2500000000000000000",
    });

    expect(percentNode(bubble).contents[0].text).toBe("25");
    expect(text(bubble)).toContain("2,500,000,000,000,000,000\n/ 10,000,000,000,000,000,001");
  });

  it("truncates an oversized boss description and drops an empty one", () => {
    const long = "描".repeat(1000);
    const bubble = bubbleFor({ description: long });
    const description = nodesOfType(bubble.body, "text").find(node =>
      node.text?.startsWith("描描")
    );

    expect(Buffer.byteLength(description.text, "utf8")).toBeLessThanOrEqual(2048);
    expect(description.text.endsWith("…")).toBe(true);
    expect(description).toMatchObject({ wrap: true, maxLines: 2, size: "xs", color: "#8A98AD" });

    // 沒有描述時整個 text node 不能存在，否則會多出一塊空白。
    const empty = bubbleFor({ description: "" });
    expect(nodesOfType(empty.body, "text")).toHaveLength(2);
  });

  it("treats a cleared_at timestamp as cleared even when hp is above zero", () => {
    const bubble = bubbleFor({ current_hp: "6000", cleared_at: new Date() });

    expect(text(bubble)).toContain("✓ 討伐完成");
    expect(percentNode(bubble)).toBeUndefined();
    expect(actions(bubble)).toHaveLength(0);
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
    // 圖片被丟掉時，輪次與名稱必須退回 body，資訊不能跟著圖片一起消失。
    expect(text(reply.contents[0])).toEqual(expect.arrayContaining(["第 3 輪 · 1 號", "王1"]));
  });

  it("renders a mixed roster where only some bosses have usable art", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({
        image: position => (position % 2 === 1 ? httpsImage(position) : "http://insecure/x.png"),
      }),
      liffUri: LIFF,
    });

    expect(reply.contents.map(bubble => images(bubble)[0]?.url)).toEqual([
      httpsImage(1),
      undefined,
      httpsImage(3),
      undefined,
      httpsImage(5),
    ]);
    // 有圖沒圖的卡都必須讀得到名稱。
    expect(reply.contents.map(bubble => text(bubble).find(value => /^王\d$/.test(value)))).toEqual([
      "王1",
      "王2",
      "王3",
      "王4",
      "王5",
    ]);
  });

  it("stays a valid five-bubble carousel within LINE's payload limit when every boss has art", () => {
    const reply = WorldBoss.generateWorldBossReply({
      status: makeStatus({ image: position => `${httpsImage(position)}?${"v".repeat(200)}` }),
      liffUri: LIFF,
      attackEnabled: true,
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

  it("uses only components and layouts that LINE Flex actually supports", () => {
    const payloads = [
      WorldBoss.generateWorldBossReply({
        status: makeStatus({ cleared: [3], image: httpsImage }),
        liffUri: LIFF,
        attackEnabled: true,
      }),
      WorldBoss.generateNoActiveSeasonBubble({ ended: true, liffUri: LIFF }),
    ];
    const allowed = ["box", "text", "image", "button", "separator", "filler", "span", "icon"];

    nodesOfType(payloads, "box").forEach(box => {
      expect(["vertical", "horizontal", "baseline"]).toContain(box.layout);
      expect(Array.isArray(box.contents)).toBe(true);
      box.contents.forEach(child => expect(allowed).toContain(child.type));
      if (box.position === "absolute") expect(box.width).not.toBe("");
    });
    nodesOfType(payloads, "button").forEach(button => {
      expect(["primary", "secondary", "link"]).toContain(button.style);
      expect(["sm", "md"]).toContain(button.height);
      expect(button.action.type === "postback" || button.action.type === "uri").toBe(true);
    });
    // span 只能掛在 text.contents 底下，而且 text 不能同時給 text 與 contents。
    nodesOfType(payloads, "text").forEach(node => {
      if (node.contents) {
        expect(node.text).toBeUndefined();
        node.contents.forEach(span => expect(span.type).toBe("span"));
      }
    });
    gradients(payloads).forEach(gradient => {
      expect(gradient.angle).toMatch(/^\d+deg$/);
      expect(gradient.startColor).toMatch(/^#[0-9A-Fa-f]{6,8}$/);
      expect(gradient.endColor).toMatch(/^#[0-9A-Fa-f]{6,8}$/);
    });
  });
});
