// U10 / KTD13：本人今日結果與歷史、真 verifyToken、privacy allowlist 與 public feed。
// DB 只使用隨機 Princess_wbtest_auto_result_*；Redis session 是 Jest mock。
const { execFileSync } = require("child_process");

process.env.DOTENV_CONFIG_QUIET = "true";
process.env.SUPPRESS_NO_CONFIG_WARNING = "true";

const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../__tests__/helpers/worldBossFixture");

function assertIsolatedLocalMysql() {
  if (!["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
    throw new Error(`refuse: DB_HOST is not local (${process.env.DB_HOST})`);
  }
  const port = process.env.DB_PORT || "3306";
  const names = execFileSync(
    "docker",
    ["ps", "--filter", `publish=${port}`, "--format", "{{.Names}}"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  ).trim();
  if (!names) throw new Error(`refuse: no local Docker MySQL publishes port ${port}`);
}
assertIsolatedLocalMysql();

const testDatabase = createWorldBossTestDatabase("auto_result");
if (!/^Princess_wbtest_auto_result_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);
jest.unmock("../../middleware/validation");
jest.mock("../../service/AuthSessionService", () => {
  const actual = jest.requireActual("../../service/AuthSessionService");
  return { ...actual, getSession: jest.fn() };
});

// Runtime router/controller load only after guard and isolated mysql mock.
const express = require("express");
const request = require("supertest");
const { getClient } = require("bottender");
const AuthSessionService = require("../../service/AuthSessionService");
const { todayUtc8, daysAgoUtc8 } = require("../../util/date");
const JankenAutoMatchController = require("../../controller/application/JankenAutoMatchController");
const JankenAutoMatchParticipant = require("../../model/application/JankenAutoMatchParticipant");
const { DefaultLogger } = require("../../util/Logger");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
const G = "C" + "f".repeat(32);
const TODAY = todayUtc8();
const A = U("a");
const B = U("b");
const C = U("c");
const D = U("d");
const OPPONENT = U("e");
const MISSING_PROFILE = U("f");
const OLD_ENV = process.env;
let app;

function createApp() {
  const server = express();
  server.use(express.json());
  server.use("/api", require("../api"));
  return server;
}

function auth(userId) {
  AuthSessionService.getSession.mockResolvedValue({ userId, displayName: "self" });
}

function privateGet(userId, suffix = "") {
  auth(userId);
  return request(app)
    .get(`/api/janken/auto-match/today${suffix}`)
    .set("Cookie", "redive_session=fixture-token");
}

function historyGet(userId, suffix = "") {
  auth(userId);
  return request(app)
    .get(`/api/janken/auto-match/history${suffix}`)
    .set("Cookie", "redive_session=fixture-token");
}

async function seedUser(userId, displayName, pictureUrl = null) {
  await mysql("user").insert({
    platform: "line",
    platform_id: userId,
    display_name: displayName,
    picture_url: pictureUrl,
  });
}

async function seedRun(runDate = TODAY) {
  await mysql("janken_auto_match_run").insert({ run_date: runDate });
}

function participant(userId, status, overrides = {}) {
  return {
    run_date: TODAY,
    user_id: userId,
    match_id: status === "bye" ? null : `match-${userId.slice(-1)}`,
    role: status === "bye" ? null : "p1",
    opponent_user_id: status === "bye" ? null : OPPONENT,
    choice: status === "bye" ? null : "rock",
    match_generation: 1,
    bet_enabled: 0,
    bet_generation: 0,
    bet_cap: 0,
    status,
    ...overrides,
  };
}

async function seedCompleted({ userId = A, opponentId = OPPONENT, missingProfile = false } = {}) {
  const matchId = `completed-${userId.slice(-1)}`;
  await mysql("janken_auto_match_participant").insert([
    participant(userId, "completed", {
      match_id: matchId,
      role: "p1",
      opponent_user_id: opponentId,
      choice: "rock",
    }),
    participant(opponentId, "completed", {
      match_id: matchId,
      role: "p2",
      opponent_user_id: userId,
      choice: "scissors",
    }),
  ]);
  await mysql("janken_records").insert({
    id: matchId,
    user_id: userId,
    target_user_id: opponentId,
    group_id: G,
    bet_amount: 300,
    bet_fee: 60,
    p1_choice: "rock",
    p2_choice: "scissors",
    elo_change: 12,
    streak_broken: 3,
    bounty_won: 90,
    source: "auto",
  });
  await mysql("janken_result").insert([
    { record_id: matchId, user_id: userId, result: 1 },
    { record_id: matchId, user_id: opponentId, result: 2 },
  ]);
  if (!missingProfile) {
    await seedUser(opponentId, "對手", "https://example.invalid/opponent.png");
  }
  await mysql("janken_auto_match_outbox").insert({
    match_id: matchId,
    role: "p1",
    event_name: "janken_win",
    run_date: TODAY,
    user_id: userId,
    occurred_at: new Date(),
    payload: { secretSentinel: "OUTBOX_MUST_NOT_APPEAR", feature: "janken" },
  });
  return matchId;
}

function collectKeys(value, keys = []) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    collectKeys(child, keys);
  }
  return keys;
}

function collectStrings(value, strings = []) {
  if (typeof value === "string") strings.push(value);
  if (!value || typeof value !== "object") return strings;
  for (const child of Object.values(value)) collectStrings(child, strings);
  return strings;
}

async function seedCurrentPreference(userId, enabled) {
  await mysql("user_auto_preference").insert({
    user_id: userId,
    auto_match_enabled: enabled ? 1 : 0,
  });
  if (enabled) {
    await mysql("subscribe_user").insert({
      user_id: userId,
      subscribe_card_key: "month_plus",
      start_at: new Date("2029-01-01T00:00:00.000Z"),
      end_at: new Date("2031-01-01T00:00:00.000Z"),
    });
  }
}

async function seedPublicMatch(id, source, p1, p2) {
  await mysql("janken_records").insert({
    id,
    user_id: p1,
    target_user_id: p2,
    p1_choice: "paper",
    p2_choice: "rock",
    source,
  });
  await mysql("janken_result").insert([
    { record_id: id, user_id: p1, result: 1 },
    { record_id: id, user_id: p2, result: 2 },
  ]);
}

describe("Janken auto-match private result + public allowlist (isolated DB)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_auto_result_/);
    expect(databaseName).not.toBe("Princess");
    process.env = {
      ...OLD_ENV,
      NODE_ENV: "production",
      APP_DOMAIN: "pudding.example",
      SUPPRESS_NO_CONFIG_WARNING: "true",
    };
    app = createApp();
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    process.env = OLD_ENV;
    await testDatabase.teardown();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    await mysql("janken_auto_match_outbox").del();
    await mysql("janken_result").del();
    await mysql("janken_records").del();
    await mysql("janken_auto_match_participant").del();
    await mysql("janken_auto_match_run").del();
    await mysql("user_auto_preference").del();
    await mysql("subscribe_user").del();
    await mysql("user").del();
  });

  test("未登入 401 且 no-store；不觸發 controller DB path", async () => {
    const response = await request(app).get("/api/janken/auto-match/today");
    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(AuthSessionService.getSession).not.toHaveBeenCalled();
  });

  test("history 未登入及 session 缺 userId 均為 401 unauthenticated，不讀 participant", async () => {
    const findRecent = jest.spyOn(JankenAutoMatchParticipant, "findRecentByUser");
    const anonymous = await request(app).get("/api/janken/auto-match/history");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers["cache-control"]).toBe("no-store");
    expect(AuthSessionService.getSession).not.toHaveBeenCalled();

    AuthSessionService.getSession.mockResolvedValue({ displayName: "no userId" });
    const incomplete = await request(app)
      .get("/api/janken/auto-match/history")
      .set("Cookie", "redive_session=fixture-token");
    expect(incomplete.status).toBe(401);
    expect(incomplete.body).toEqual({ error: "unauthenticated" });
    expect(findRecent).not.toHaveBeenCalled();
  });

  test("history 混合狀態依日期降冪、包含今天、不含缺席日或別人資料，保持 privacy", async () => {
    const dates = [TODAY, daysAgoUtc8(1), daysAgoUtc8(3), daysAgoUtc8(4)];
    await mysql("janken_auto_match_run").insert(dates.map(run_date => ({ run_date })));
    const matchId = await seedCompleted();
    await mysql("janken_auto_match_participant").insert([
      participant(A, "failed", { run_date: dates[2] }),
      participant(A, "not_started", { run_date: dates[3] }),
      participant(A, "bye", { run_date: dates[1] }),
      participant(B, "bye"),
    ]);
    const queries = [];
    const capture = query => queries.push(query.sql);
    mysql.on("query", capture);
    let response;
    try {
      response = await historyGet(A, `?userId=${B}`);
    } finally {
      mysql.off("query", capture);
    }

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(response.body)).toEqual(["items"]);
    expect(response.body.items.map(item => item.run_date)).toEqual(dates);
    expect(response.body.items[0]).toEqual((await privateGet(A)).body);
    expect(response.body.items.slice(1)).toEqual([
      { run_date: dates[1], status: "bye", reason: "no_opponent", match: null },
      { run_date: dates[2], status: "failed", reason: "match_failed", match: null },
      { run_date: dates[3], status: "failed", reason: "not_started", match: null },
    ]);
    for (const item of response.body.items) {
      expect(Object.keys(item).sort()).toEqual(["match", "reason", "run_date", "status"]);
      expect(typeof item.run_date).toBe("string");
      expect(item.run_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(response.body.items[0].match.opponent).toEqual({
      displayName: "對手",
      pictureUrl: "https://example.invalid/opponent.png",
    });
    const body = JSON.stringify(response.body);
    for (const secret of [A, B, OPPONENT, G, matchId, "OUTBOX_MUST_NOT_APPEAR"]) {
      expect(body).not.toContain(secret);
    }
    expect(
      collectKeys(response.body).some(key => /user.?id|match.?id|payload|outbox/i.test(key))
    ).toBe(false);
    expect(queries.some(sql => /janken_auto_match_outbox/i.test(sql))).toBe(false);
  });

  test("history 正規化 mysql2 +08:00 DATE object，不把曆日退回 UTC 前一天", async () => {
    await seedRun();
    await mysql("janken_auto_match_participant").insert(participant(A, "bye"));
    const row = await JankenAutoMatchParticipant.findByUserAndDate(A, TODAY);
    expect(row.run_date).toBeInstanceOf(Date);
    expect(row.run_date.toISOString()).toBe(new Date(`${TODAY}T00:00:00+08:00`).toISOString());
    expect((await historyGet(A)).body.items).toEqual([
      { run_date: TODAY, status: "bye", reason: "no_opponent", match: null },
    ]);
  });

  test("history 同樣接受 DATE string；未知 manifest 狀態依共用映射回 failed", async () => {
    jest
      .spyOn(JankenAutoMatchParticipant, "findRecentByUser")
      .mockResolvedValue([participant(A, "invalid", { run_date: "2030-01-01" })]);
    const response = await historyGet(A);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      {
        run_date: "2030-01-01",
        status: "failed",
        reason: "invalid_manifest_status",
        match: null,
      },
    ]);
  });

  test("history limit 預設 30、非數字用預設、限制 1..60 並只取最近列", async () => {
    const dates = Array.from({ length: 65 }, (_, index) => daysAgoUtc8(index));
    await mysql("janken_auto_match_run").insert(dates.map(run_date => ({ run_date })));
    await mysql("janken_auto_match_participant").insert(
      dates.map(run_date => participant(A, "bye", { run_date }))
    );
    for (const [suffix, limit] of [
      ["", 30],
      ["?limit=garbage", 30],
      ["?limit=12abc", 30],
      ["?limit=Infinity", 30],
      ["?limit=", 30],
      ["?limit=0", 1],
      ["?limit=-10", 1],
      ["?limit=1", 1],
      ["?limit=2", 2],
      ["?limit=2.9", 2],
      ["?limit=60", 60],
      ["?limit=999", 60],
    ]) {
      const response = await historyGet(A, suffix);
      expect(response.status).toBe(200);
      expect(response.body.items.map(item => item.run_date)).toEqual(dates.slice(0, limit));
    }
    expect((await historyGet(B)).body).toEqual({ items: [] });
  });

  test("history completed 缺持久化結果沿用 result_unavailable", async () => {
    await seedRun();
    await mysql("janken_auto_match_participant").insert(participant(A, "completed"));
    const response = await historyGet(A);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      { run_date: TODAY, status: "failed", reason: "result_unavailable", match: null },
    ]);
  });

  test("history DB 失敗回 500，DefaultLogger 不含 user 資料或原始 error", async () => {
    jest
      .spyOn(JankenAutoMatchParticipant, "findRecentByUser")
      .mockRejectedValue(new Error(`private DB details: ${A}`));
    const response = await historyGet(A);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "internal_error" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(DefaultLogger.error).toHaveBeenCalledTimes(1);
    expect(DefaultLogger.error).toHaveBeenCalledWith("janken.auto-match.history failed");
  });

  test("completed 本人可見、query userId 被忽略、結果投影可直接使用且不讀 outbox", async () => {
    await seedUser(A, "本人");
    await seedUser(B, "另一位");
    await seedRun();
    await seedCompleted();
    await mysql("janken_auto_match_participant").insert(participant(B, "bye"));
    const lineCallsBefore = getClient.mock.calls.length;
    const queries = [];
    const capture = query => query.__knexQueryUid && queries.push(query.sql);
    mysql.on("query", capture);

    let response;
    try {
      response = await privateGet(A, `?userId=${B}`);
    } finally {
      mysql.off("query", capture);
    }

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      run_date: TODAY,
      status: "completed",
      reason: null,
      match: {
        result: "win",
        choice: "rock",
        opponentChoice: "scissors",
        settlement: {
          betAmount: 300,
          fee: 60,
          eloChange: 12,
          streakBroken: 3,
          bountyWon: 90,
        },
        opponent: {
          displayName: "對手",
          pictureUrl: "https://example.invalid/opponent.png",
        },
      },
    });
    expect(response.body.status).not.toBe("bye");
    expect(queries.some(sql => /janken_auto_match_outbox/i.test(sql))).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain("OUTBOX_MUST_NOT_APPEAR");
    expect(getClient.mock.calls.length).toBe(lineCallsBefore);
  });

  test("completed 後即使目前 opt-out，participant durable 結果仍可見", async () => {
    await seedUser(A, "本人");
    await seedRun();
    await seedCompleted();
    await mysql("user_auto_preference").insert({ user_id: A, auto_match_enabled: 0 });

    const response = await privateGet(A);

    expect(response.body).toMatchObject({ status: "completed", reason: null });
  });

  test("p2 敗方只回自身可證實資料；未持久化的敗方 ELO delta 為 null、不反推", async () => {
    await seedUser(A, "甲");
    await seedRun();
    await seedCompleted();

    const response = await privateGet(OPPONENT);

    expect(response.body).toMatchObject({
      status: "completed",
      match: {
        result: "lose",
        choice: "scissors",
        opponentChoice: "rock",
        settlement: {
          betAmount: 300,
          fee: 60,
          eloChange: null,
          bountyWon: 0,
        },
        opponent: { displayName: "甲", pictureUrl: null },
      },
    });
  });

  test("缺對手 profile 固定 unknown+null；recursive keys/values 無 UID、群組與私密欄位", async () => {
    await seedUser(A, "本人");
    await seedRun();
    await seedCompleted({ opponentId: MISSING_PROFILE, missingProfile: true });

    const response = await privateGet(A);

    expect(response.body.match.opponent).toEqual({ displayName: "unknown", pictureUrl: null });
    const keys = collectKeys(response.body);
    expect(
      keys.some(key => /user.?id|group|contact|balance|cap|generation|raw|payload/i.test(key))
    ).toBe(false);
    const strings = collectStrings(response.body);
    expect(strings).not.toContain(A);
    expect(strings).not.toContain(MISSING_PROFILE);
    expect(strings).not.toContain(G);
    expect(strings.some(value => /^[CUR][a-f0-9]{32}$/.test(value))).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain("OUTBOX_MUST_NOT_APPEAR");
  });

  test("bye / failed / not_started 映射清楚；not_started 不混成 bye 或 not_executed", async () => {
    for (const userId of [B, C, D]) await seedUser(userId, `user-${userId.slice(-1)}`);
    await seedRun();
    await mysql("janken_auto_match_participant").insert([
      participant(B, "bye"),
      participant(C, "failed"),
      participant(D, "not_started"),
    ]);

    expect((await privateGet(B)).body).toMatchObject({
      run_date: TODAY,
      status: "bye",
      reason: "no_opponent",
      match: null,
    });
    expect((await privateGet(C)).body).toMatchObject({
      status: "failed",
      reason: "match_failed",
      match: null,
    });
    expect((await privateGet(D)).body).toMatchObject({
      status: "failed",
      reason: "not_started",
      match: null,
    });
  });

  test("21:00 前 waiting、未開偏好 not_participating；21:00 後才可回 run_not_executed", async () => {
    const waitingUser = U("1");
    const offUser = U("2");
    await seedCurrentPreference(waitingUser, true);
    await seedCurrentPreference(offUser, false);
    const before = new Date("2030-01-01T12:00:00.000Z"); // 20:00 Asia/Taipei
    const after = new Date("2030-01-01T14:00:00.000Z"); // 22:00 Asia/Taipei

    await expect(
      JankenAutoMatchController._internal.getTodayResult(waitingUser, before)
    ).resolves.toMatchObject({
      run_date: "2030-01-01",
      status: "not_executed",
      reason: "waiting_for_schedule",
    });
    await expect(
      JankenAutoMatchController._internal.getTodayResult(offUser, before)
    ).resolves.toMatchObject({
      status: "not_executed",
      reason: "not_participating",
    });
    await expect(
      JankenAutoMatchController._internal.getTodayResult(waitingUser, after)
    ).resolves.toMatchObject({
      status: "not_executed",
      reason: "run_not_executed",
    });
  });

  test("當日 run 已存在但本人沒有 manifest：只說 not_in_run，不宣稱全站未執行", async () => {
    const userId = U("3");
    await seedUser(userId, "未進本輪");
    await seedRun();

    const response = await privateGet(userId);

    expect(response.body).toEqual({
      run_date: TODAY,
      status: "not_executed",
      reason: "not_in_run",
      match: null,
    });
  });

  test("public recent-matches 僅 allowlist manual/arena，舊 shape 保留且 auto 排除", async () => {
    const p1 = U("8");
    const p2 = U("9");
    await seedUser(p1, "公開甲");
    await seedUser(p2, "公開乙");
    await seedPublicMatch("public-manual", "manual", p1, p2);
    await seedPublicMatch("public-arena", "arena", p1, p2);
    await seedPublicMatch("private-auto", "auto", p1, p2);

    const response = await request(app).get("/api/janken/recent-matches");

    expect(response.status).toBe(200);
    expect(response.body.map(row => row.id)).toEqual(
      expect.arrayContaining(["public-manual", "public-arena"])
    );
    expect(response.body.map(row => row.id)).not.toContain("private-auto");
    expect(response.body.find(row => row.id === "public-manual")).toMatchObject({
      player1: { displayName: "公開甲", choice: "布", result: "win" },
      player2: { displayName: "公開乙", choice: "石頭", result: "lose" },
      betAmount: 0,
      eloChange: 0,
    });
  });
});
