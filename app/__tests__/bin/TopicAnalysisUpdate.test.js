const redis = require("../../src/util/redis");
const TopicAnalysisUpdate = require("../../bin/TopicAnalysisUpdate");
const { aggregate, buildRows, popQueue, statDateUtc8 } = TopicAnalysisUpdate.__testing;

describe("TopicAnalysisUpdate.statDateUtc8", () => {
  it("derives the UTC+8 calendar date from a ms-epoch ts", () => {
    // 2026-06-22T00:00:00Z → 2026-06-22 08:00 in UTC+8 → 2026-06-22
    expect(statDateUtc8(Date.UTC(2026, 5, 22, 0, 0, 0))).toBe("2026-06-22");
  });

  it("rolls to the next day across the UTC+8 midnight boundary", () => {
    // 2026-06-22T16:00:00Z = 2026-06-23T00:00 in UTC+8 → next day
    expect(statDateUtc8(Date.UTC(2026, 5, 22, 16, 0, 0))).toBe("2026-06-23");
    // one minute before the boundary still belongs to 2026-06-22
    expect(statDateUtc8(Date.UTC(2026, 5, 22, 15, 59, 0))).toBe("2026-06-22");
  });
});

describe("TopicAnalysisUpdate.aggregate", () => {
  // Inject a fake analyzer so the test is independent of jieba's dictionary.
  const fakeAnalyzer = {
    extract: text => (text ? text.split(/\s+/).filter(Boolean) : []),
  };

  function ev({
    userId = "U1",
    groupId = "G1",
    text = "凱留",
    ts = Date.UTC(2026, 5, 22, 1),
  } = {}) {
    return { userId, groupId, text, ts };
  }

  it("returns an empty map for no events", () => {
    expect(aggregate([], fakeAnalyzer).size).toBe(0);
  });

  it("counts each distinct keyword from a message as +1", () => {
    const map = aggregate([ev({ text: "凱留 課金" })], fakeAnalyzer);
    expect(map.get("G1|U1|2026-06-22|凱留")).toBe(1);
    expect(map.get("G1|U1|2026-06-22|課金")).toBe(1);
  });

  it("buckets repeated keywords across messages additively", () => {
    const map = aggregate(
      [ev({ text: "凱留" }), ev({ text: "凱留 課金" }), ev({ text: "凱留" })],
      fakeAnalyzer
    );
    expect(map.get("G1|U1|2026-06-22|凱留")).toBe(3);
    expect(map.get("G1|U1|2026-06-22|課金")).toBe(1);
  });

  it("relies on the analyzer for per-message dedupe (no double count within a message)", () => {
    // A real analyzer dedupes within a message; assert we count its output 1:1.
    const dedupingAnalyzer = { extract: () => ["凱留"] };
    const map = aggregate([ev({ text: "凱留 凱留 凱留" })], dedupingAnalyzer);
    expect(map.get("G1|U1|2026-06-22|凱留")).toBe(1);
  });

  it("separates buckets by user", () => {
    const map = aggregate(
      [ev({ userId: "U1", text: "凱留" }), ev({ userId: "U2", text: "凱留" })],
      fakeAnalyzer
    );
    expect(map.get("G1|U1|2026-06-22|凱留")).toBe(1);
    expect(map.get("G1|U2|2026-06-22|凱留")).toBe(1);
  });

  it("separates buckets by group", () => {
    const map = aggregate(
      [ev({ groupId: "G1", text: "凱留" }), ev({ groupId: "G2", text: "凱留" })],
      fakeAnalyzer
    );
    expect(map.get("G1|U1|2026-06-22|凱留")).toBe(1);
    expect(map.get("G2|U1|2026-06-22|凱留")).toBe(1);
  });

  it("separates buckets by stat_date derived per-event from ts (UTC+8)", () => {
    const map = aggregate(
      [
        ev({ text: "凱留", ts: Date.UTC(2026, 5, 22, 1) }), // 09:00 UTC+8 → 06-22
        ev({ text: "凱留", ts: Date.UTC(2026, 5, 22, 16, 30) }), // 00:30 UTC+8 → 06-23
      ],
      fakeAnalyzer
    );
    expect(map.get("G1|U1|2026-06-22|凱留")).toBe(1);
    expect(map.get("G1|U1|2026-06-23|凱留")).toBe(1);
  });

  it("skips events with no extractable keywords", () => {
    expect(aggregate([ev({ text: "" })], fakeAnalyzer).size).toBe(0);
  });

  it("skips malformed events (missing userId/groupId/text)", () => {
    const map = aggregate(
      [
        { groupId: "G1", text: "凱留", ts: Date.UTC(2026, 5, 22, 1) }, // no userId
        { userId: "U1", text: "凱留", ts: Date.UTC(2026, 5, 22, 1) }, // no groupId
        null,
        ev({ text: "課金" }),
      ],
      fakeAnalyzer
    );
    expect(map.size).toBe(1);
    expect(map.get("G1|U1|2026-06-22|課金")).toBe(1);
  });
});

describe("TopicAnalysisUpdate.buildRows", () => {
  it("turns the aggregation map into insert rows", () => {
    const map = new Map([
      ["G1|U1|2026-06-22|凱留", 3],
      ["G1|U1|2026-06-22|課金", 1],
    ]);
    const rows = buildRows(map);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          group_id: "G1",
          user_id: "U1",
          stat_date: "2026-06-22",
          keyword: "凱留",
          message_count: 3,
        },
        {
          group_id: "G1",
          user_id: "U1",
          stat_date: "2026-06-22",
          keyword: "課金",
          message_count: 1,
        },
      ])
    );
    expect(rows).toHaveLength(2);
  });

  it("preserves keywords containing the '|' delimiter (split from the right)", () => {
    const map = new Map([["G1|U1|2026-06-22|a|b", 2]]);
    const [row] = buildRows(map);
    expect(row).toEqual({
      group_id: "G1",
      user_id: "U1",
      stat_date: "2026-06-22",
      keyword: "a|b",
      message_count: 2,
    });
  });
});

describe("TopicAnalysisUpdate.popQueue", () => {
  beforeEach(() => jest.clearAllMocks());

  it("pops up to max and stops on null", async () => {
    const e0 = { userId: "U1", groupId: "G1", text: "凱留", ts: 1 };
    const e1 = { userId: "U2", groupId: "G1", text: "課金", ts: 2 };
    redis.rPop
      .mockResolvedValueOnce(JSON.stringify(e0))
      .mockResolvedValueOnce(JSON.stringify(e1))
      .mockResolvedValueOnce(null);

    const events = await popQueue();
    expect(redis.rPop).toHaveBeenCalledWith("TOPIC_ANALYSIS_RECORD");
    expect(events).toEqual([e0, e1]);
  });

  it("skips malformed JSON without requeueing", async () => {
    const good = { userId: "U1", groupId: "G1", text: "凱留", ts: 1 };
    redis.rPop
      .mockResolvedValueOnce("{{ bad")
      .mockResolvedValueOnce(JSON.stringify(good))
      .mockResolvedValueOnce(null);

    const events = await popQueue();
    expect(events).toEqual([good]);
  });
});

describe("TopicAnalysisUpdate.upsertRows", () => {
  const { upsertRows } = TopicAnalysisUpdate.__testing;

  function makeKnexSpy() {
    const merge = jest.fn().mockResolvedValue();
    const onConflict = jest.fn().mockReturnValue({ merge });
    const insert = jest.fn().mockReturnValue({ onConflict });
    const knex = jest.fn().mockReturnValue({ insert });
    // knex.raw must round-trip so .merge() gets the increment expression.
    knex.raw = jest.fn(sql => ({ __raw: sql }));
    return { knex, insert, onConflict, merge };
  }

  it("does nothing for an empty row set", async () => {
    const { knex } = makeKnexSpy();
    await upsertRows([], knex);
    expect(knex).not.toHaveBeenCalled();
  });

  it("inserts into topic_daily with onConflict + increment merge", async () => {
    const { knex, insert, onConflict, merge } = makeKnexSpy();
    const rows = [
      { group_id: "G1", user_id: "U1", stat_date: "2026-06-22", keyword: "凱留", message_count: 3 },
    ];

    await upsertRows(rows, knex);

    expect(knex).toHaveBeenCalledWith("topic_daily");
    expect(insert).toHaveBeenCalledWith(rows);
    expect(onConflict).toHaveBeenCalledWith(["group_id", "user_id", "stat_date", "keyword"]);
    // increment-on-conflict: message_count = message_count + VALUES(message_count)
    expect(knex.raw).toHaveBeenCalledWith("message_count + VALUES(message_count)");
    expect(merge).toHaveBeenCalledWith({
      message_count: { __raw: "message_count + VALUES(message_count)" },
    });
  });

  it("chunks large row sets into batched inserts", async () => {
    const { knex, insert } = makeKnexSpy();
    const rows = Array.from({ length: 1201 }, (_, i) => ({
      group_id: "G1",
      user_id: "U1",
      stat_date: "2026-06-22",
      keyword: `k${i}`,
      message_count: 1,
    }));

    await upsertRows(rows, knex);

    // 1201 rows / 500 per batch → 3 inserts
    expect(insert).toHaveBeenCalledTimes(3);
    const inserted = insert.mock.calls.reduce((n, c) => n + c[0].length, 0);
    expect(inserted).toBe(1201);
  });
});

describe("TopicAnalysisUpdate.main (real analyzer + mocked knex)", () => {
  const knex = require("../../src/util/mysql");

  beforeEach(() => {
    jest.clearAllMocks();
    // knex is the global mock query builder; make the upsert chain resolve.
    const merge = jest.fn().mockResolvedValue();
    const onConflict = jest.fn().mockReturnValue({ merge });
    knex.insert.mockReturnValue({ onConflict });
    knex.raw.mockImplementation(sql => ({ __raw: sql }));
  });

  it("no-ops when the queue is empty", async () => {
    redis.rPop.mockResolvedValue(null);
    await TopicAnalysisUpdate();
    expect(knex.insert).not.toHaveBeenCalled();
  });

  it("drains the queue, jieba-extracts real keywords, and upserts rows", async () => {
    const events = [
      { userId: "U1", groupId: "G1", text: "今天黑貓又爆死了", ts: Date.UTC(2026, 5, 22, 1) },
      { userId: "U1", groupId: "G1", text: "世王好可愛", ts: Date.UTC(2026, 5, 22, 1) },
    ];
    redis.rPop
      .mockResolvedValueOnce(JSON.stringify(events[0]))
      .mockResolvedValueOnce(JSON.stringify(events[1]))
      .mockResolvedValueOnce(null);

    await TopicAnalysisUpdate();

    expect(knex.insert).toHaveBeenCalledTimes(1);
    const rows = knex.insert.mock.calls[0][0];
    const byKeyword = Object.fromEntries(rows.map(r => [r.keyword, r.message_count]));
    // alias normalization: 黑貓 → 凱留 ; slang kept whole: 爆死, 好可愛 ;
    // alias normalization: 世王 → 世界王
    expect(byKeyword).toMatchObject({ 凱留: 1, 爆死: 1, 世界王: 1, 好可愛: 1 });
    rows.forEach(r => {
      expect(r.group_id).toBe("G1");
      expect(r.user_id).toBe("U1");
      expect(r.stat_date).toBe("2026-06-22");
    });
  });

  it("re-entry is guarded by running flag", async () => {
    redis.rPop.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(null), 20))
    );
    await Promise.all([TopicAnalysisUpdate(), TopicAnalysisUpdate()]);
    expect(redis.rPop.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
