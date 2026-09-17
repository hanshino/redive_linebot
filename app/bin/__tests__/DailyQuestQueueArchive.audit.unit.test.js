// bounded authorized archive final audit — DailyQuestQueueArchive.audit()/--audit CLI mode.
// Fully mocked (mysql/redis/DailyQuestService/config); no real DB, no real Redis, no dotenv,
// no network. Must NOT be run alongside the existing real-DB DailyQuestQueueArchive.test.js.

let bridgeState;
let archiveRows = [];
let legacyPaidUserIds = new Set();
let signinUserIds = new Set();
let jankenUserIds = new Set();
let insertCalls = [];
let openCalls = [];
let transactionShouldReject = false;

// 極簡假 knex：僅支援本檔案實際用到的 table／chain 組合，任何非預期呼叫直接拋錯，
// 而不是靜默通過——避免測試在錯誤前提下誤判為綠燈。
function fakeDb(table) {
  openCalls.push(table);
  if (table === "daily_quest_bridge_state") {
    const b = {};
    b.where = jest.fn(() => b);
    b.first = jest.fn(() => Promise.resolve(bridgeState));
    return b;
  }
  if (table === "daily_quest_legacy_queue_archive") {
    const b = {};
    let minId = 0;
    let limit = Infinity;
    b.where = jest.fn((_col, _op, val) => {
      minId = val;
      return b;
    });
    b.orderBy = jest.fn(() => b);
    b.limit = jest.fn(n => {
      limit = n;
      return b;
    });
    b.select = jest.fn(() =>
      Promise.resolve(archiveRows.filter(row => row.id > minId).slice(0, limit))
    );
    b.insert = jest.fn(rows => {
      insertCalls.push(rows);
      return Promise.resolve([1]);
    });
    return b;
  }
  if (table === "daily_quest") {
    const b = {};
    let userId;
    b.where = jest.fn(cond => {
      userId = cond.user_id;
      return b;
    });
    b.whereRaw = jest.fn(() => b);
    b.first = jest.fn(() => Promise.resolve(legacyPaidUserIds.has(userId) ? { id: 999 } : null));
    return b;
  }
  throw new Error(`fakeDb: unexpected table "${table}" — extend the fake, don't skip it`);
}
fakeDb.transaction = jest.fn(async cb => {
  if (transactionShouldReject) {
    throw Object.assign(new Error("capture tx failed"), { code: "CAPTURE_TX_FAILED" });
  }
  return cb(fakeDb);
});

jest.mock("../../src/util/mysql", () => fakeDb);
jest.mock("../../src/util/redis", () => ({
  lRange: jest.fn(),
  rPop: jest.fn(),
  lTrim: jest.fn(),
  del: jest.fn(),
}));
jest.mock("config", () => ({ get: jest.fn(() => "event_center:daily_quest") }));
jest.mock("../../src/service/DailyQuestService", () => ({
  hasNormalSignin: jest.fn(),
  hasQualifyingJanken: jest.fn(),
}));

const redis = require("../../src/util/redis");
const { DefaultLogger } = require("../../src/util/Logger");
const DailyQuestService = require("../../src/service/DailyQuestService");
const Archive = require("../DailyQuestQueueArchive");

function resetState() {
  bridgeState = { id: 1, since_date: "2026-09-07", activated_at: null };
  archiveRows = [];
  legacyPaidUserIds = new Set();
  signinUserIds = new Set();
  jankenUserIds = new Set();
  insertCalls = [];
  openCalls = [];
  transactionShouldReject = false;
  jest.clearAllMocks();
  DailyQuestService.hasNormalSignin.mockImplementation((_db, userId) =>
    Promise.resolve(signinUserIds.has(userId))
  );
  DailyQuestService.hasQualifyingJanken.mockImplementation((_db, userId) =>
    Promise.resolve(jankenUserIds.has(userId))
  );
}

function seedFourClassifications() {
  const paid = "Ua";
  const scannerPay = "Ub";
  const notEligible = "Uc";
  const partial = "Ud";
  legacyPaidUserIds.add(paid);
  signinUserIds.add(scannerPay);
  jankenUserIds.add(scannerPay);
  signinUserIds.add(partial); // only signin, no janken -> unknown (partial)
  archiveRows = [
    { id: 1, raw: JSON.stringify({ userId: paid }) },
    { id: 2, raw: JSON.stringify({ userId: scannerPay }) },
    { id: 3, raw: JSON.stringify({ userId: notEligible }) },
    { id: 4, raw: JSON.stringify({ userId: partial }) },
    { id: 5, raw: "malformed-not-json" },
  ];
  return { paid, scannerPay, notEligible, partial };
}

beforeEach(resetState);

describe("DailyQuestQueueArchive.audit (mocked, no real DB/Redis)", () => {
  test("完整分頁走訪不遺漏任何列，四類分類全部正確（跨 3 頁）", async () => {
    seedFourClassifications();

    const result = await Archive.audit({ db: fakeDb, pageSize: 2 });

    expect(result).toMatchObject({
      passed: false,
      sinceDate: "2026-09-07",
      total: 5,
      counts: { legacyPaid: 1, scannerWillPay: 1, notEligible: 1, unknown: 2 },
      unknownIds: [4, 5],
    });
    // pageSize=2、5 列 → 3 次 select（[1,2] [3,4] [5]），驗證確實逐頁走訪、無遺漏。
    const archiveOpens = openCalls.filter(t => t === "daily_quest_legacy_queue_archive");
    expect(archiveOpens).toHaveLength(3);
  });

  test("先前 capture 留下的 unknown 列即使目前活躍佇列是空的仍會被回報；audit 完全不碰 Redis", async () => {
    seedFourClassifications();
    redis.lRange.mockResolvedValue([]); // 模擬「目前佇列是空的」——audit 根本不該去讀它。

    const result = await Archive.audit({ db: fakeDb });

    expect(result.passed).toBe(false);
    expect(result.unknownIds).toEqual([4, 5]);
    expect(redis.lRange).not.toHaveBeenCalled();
  });

  test("audit 不寫入任何 SQL、不呼叫任何 Redis 方法", async () => {
    seedFourClassifications();

    await Archive.audit({ db: fakeDb });

    expect(insertCalls).toHaveLength(0);
    expect(redis.lRange).not.toHaveBeenCalled();
    expect(redis.rPop).not.toHaveBeenCalled();
    expect(redis.lTrim).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  test("bridge state 缺失：fail closed，不讀任何 archive 列", async () => {
    bridgeState = undefined;
    archiveRows = [{ id: 1, raw: JSON.stringify({ userId: "Ux" }) }];

    await expect(Archive.audit({ db: fakeDb })).rejects.toMatchObject({
      code: "BRIDGE_STATE_MISSING",
    });
    expect(openCalls).not.toContain("daily_quest_legacy_queue_archive");
  });

  test("bridge 已 activated：fail closed，不讀任何 archive 列（與 pre-activation 契約一致）", async () => {
    bridgeState = { id: 1, since_date: "2026-09-07", activated_at: new Date() };
    archiveRows = [{ id: 1, raw: JSON.stringify({ userId: "Ux" }) }];

    await expect(Archive.audit({ db: fakeDb })).rejects.toMatchObject({
      code: "BRIDGE_ALREADY_ACTIVATED",
    });
    expect(openCalls).not.toContain("daily_quest_legacy_queue_archive");
  });

  test("分類過程中的錯誤會讓 audit() reject，不會被吞掉當成完成", async () => {
    seedFourClassifications();
    DailyQuestService.hasNormalSignin.mockRejectedValueOnce(new Error("boom"));

    await expect(Archive.audit({ db: fakeDb })).rejects.toThrow("boom");
  });

  test("逐頁 log 精確的 {archiveId, classification} 對應（含跨頁），全 4 種分類；不累積成單一巨大陣列", async () => {
    seedFourClassifications();

    await Archive.audit({ db: fakeDb, pageSize: 2 });

    const infoLogs = DefaultLogger.info.mock.calls.map(args => args.join(" "));
    const pageLogs = infoLogs.filter(line => line.includes("audit page="));
    // pageSize=2、5 列 → 3 次 page log，每次都是「這一頁」的陣列，不是累積到目前為止的全部。
    expect(pageLogs).toHaveLength(3);

    const pagePayloads = pageLogs.map(line => JSON.parse(line.slice(line.indexOf("page=") + 5)));
    expect(pagePayloads[0]).toEqual([
      { archiveId: 1, classification: "legacyPaid" },
      { archiveId: 2, classification: "scannerWillPay" },
    ]);
    expect(pagePayloads[1]).toEqual([
      { archiveId: 3, classification: "notEligible" },
      { archiveId: 4, classification: "unknown" },
    ]);
    expect(pagePayloads[2]).toEqual([{ archiveId: 5, classification: "unknown" }]);
    // 每頁筆數 <= pageSize：從沒有一次 log 承載超過當頁筆數的內容（不是全量累積後才 log）。
    for (const payload of pagePayloads) expect(payload.length).toBeLessThanOrEqual(2);

    // stable DB id 在跨頁後仍被正確保留進最終回傳值。
    const result = await Archive.audit({ db: fakeDb, pageSize: 2 });
    expect(result.unknownIds).toEqual([4, 5]);
  });
});

describe("DailyQuestQueueArchive.runCLI --audit", () => {
  test("完整 audit 且 unknown=0 才 exit(0)", async () => {
    const paid = "Ua";
    legacyPaidUserIds.add(paid);
    archiveRows = [{ id: 1, raw: JSON.stringify({ userId: paid }) }];
    const exit = jest.fn();

    await Archive.runCLI({ argv: ["--audit"], exit, options: { db: fakeDb } });

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test("unknown>0 時 exit(1)（即使沒有丟出例外，只是分類不完整）", async () => {
    seedFourClassifications();
    const exit = jest.fn();

    await Archive.runCLI({ argv: ["--audit"], exit, options: { db: fakeDb } });

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  test("audit() 本身丟出例外（如 bridge state 缺失）時 exit(1)，不是 exit(0)", async () => {
    bridgeState = undefined;
    const exit = jest.fn();

    await Archive.runCLI({ argv: ["--audit"], exit, options: { db: fakeDb } });

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  test("capture 模式（無 --audit）transaction 失敗時，分類階段完全不會被執行；capture 語意保持向後相容", async () => {
    transactionShouldReject = true;
    const exit = jest.fn();
    redis.lRange.mockResolvedValue([JSON.stringify({ userId: "Uy" })]);

    await Archive.runCLI({
      argv: [],
      exit,
      options: { db: fakeDb, redisClient: redis, queueKey: "event_center:daily_quest" },
    });

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    // transaction 先失敗 → main() 的分類迴圈（呼叫 classify → DailyQuestService）完全沒機會執行。
    expect(DailyQuestService.hasNormalSignin).not.toHaveBeenCalled();
    expect(DailyQuestService.hasQualifyingJanken).not.toHaveBeenCalled();
    expect(openCalls).not.toContain("daily_quest");
  });

  test("既有 main／classify export 與新 audit／runCLI 並存，capture-mode 成功路徑仍是 exit(0)", async () => {
    expect(typeof Archive.main).toBe("function");
    expect(typeof Archive.classify).toBe("function");
    expect(typeof Archive.audit).toBe("function");
    expect(typeof Archive.runCLI).toBe("function");
    expect(Archive).toBe(Archive.main); // module.exports = main 這個既有契約沒被打破。

    const exit = jest.fn();
    redis.lRange.mockResolvedValue([]);

    await Archive.runCLI({
      argv: [],
      exit,
      options: { db: fakeDb, redisClient: redis, queueKey: "event_center:daily_quest" },
    });

    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe("DailyQuestQueueArchive.runCLI argv 契約：只接受 [] 或 ['--audit']", () => {
  test.each([["--auidt"], ["--audit", "extra"], ["--audit", "--audit"], ["capture"], ["--force"]])(
    "非法 argv %j：exit(1)，main／audit 都不會被呼叫，不做任何 SQL／Redis I/O",
    async argv => {
      const exit = jest.fn();
      seedFourClassifications(); // 就算資料存在也不該被讀到。

      await Archive.runCLI({ argv, exit, options: { db: fakeDb, redisClient: redis } });

      expect(exit).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(1);
      expect(openCalls).toHaveLength(0);
      expect(insertCalls).toHaveLength(0);
      expect(redis.lRange).not.toHaveBeenCalled();
      expect(DailyQuestService.hasNormalSignin).not.toHaveBeenCalled();
      expect(DailyQuestService.hasQualifyingJanken).not.toHaveBeenCalled();
    }
  );

  test("非法 argv 的錯誤 log 不會逐字回顯原始 argv 內容（避免 echo 操作者打錯的敏感字串）", async () => {
    const exit = jest.fn();
    const sentinel = "SENSITIVE_TYPO_TOKEN_abc123";

    await Archive.runCLI({ argv: [sentinel], exit, options: { db: fakeDb } });

    expect(exit).toHaveBeenCalledWith(1);
    const logs = [DefaultLogger.info, DefaultLogger.warn, DefaultLogger.error]
      .flatMap(logger => logger.mock.calls.flat())
      .join(" ");
    expect(logs).not.toContain(sentinel);
  });

  test("空陣列 [] 與剛好一個 '--audit' 仍分別視為合法 capture／audit 模式（回歸既有行為）", async () => {
    const exitCapture = jest.fn();
    redis.lRange.mockResolvedValue([]);
    await Archive.runCLI({
      argv: [],
      exit: exitCapture,
      options: { db: fakeDb, redisClient: redis, queueKey: "k" },
    });
    expect(exitCapture).toHaveBeenCalledWith(0);

    resetState();
    const exitAudit = jest.fn();
    await Archive.runCLI({ argv: ["--audit"], exit: exitAudit, options: { db: fakeDb } });
    expect(exitAudit).toHaveBeenCalledWith(0);
  });
});

describe("隱私：不 log 原始 raw payload 或 userId", () => {
  test("audit + runCLI 的所有 log 呼叫都只含 id／counts，不含 raw JSON 或 userId 子字串", async () => {
    const { paid, scannerPay, notEligible, partial } = seedFourClassifications();
    const exit = jest.fn();

    await Archive.runCLI({ argv: ["--audit"], exit, options: { db: fakeDb } });

    const logs = [DefaultLogger.info, DefaultLogger.warn, DefaultLogger.error]
      .flatMap(logger => logger.mock.calls.flat())
      .join(" ");
    for (const raw of archiveRows.map(r => r.raw)) expect(logs).not.toContain(raw);
    for (const userId of [paid, scannerPay, notEligible, partial]) {
      expect(logs).not.toContain(userId);
    }
  });
});
