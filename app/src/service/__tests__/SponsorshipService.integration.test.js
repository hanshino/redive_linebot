/**
 * SponsorshipService 真實 MySQL 整合測試（docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §11/§12）。
 *
 * 連線目標：由 worldBossFixture 另建的本機隔離資料庫 `Princess_wbtest_sponsorship_*`，
 * 跑完整 migration 後使用，結束時 DROP。絕不碰 `Princess`。
 * 故障注入只 spy 單一 issue / audit 呼叫，其餘全走真 DB；不 monkeypatch transaction。
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const dbConfig = require("../../../knexfile");

// ---- 安全閘（fail closed）：只允許「本機 Docker 容器 publish 出來的 MySQL」 -------------------
// 光看 host 是 localhost 不夠——SSH tunnel / port-forward 也會長成 localhost:3306，
// 而 fixture 會用 root 做 CREATE/DROP DATABASE。所以在建立任何連線前，先用 docker ps
// 確認真的有一個 running、image 為 mysql 的容器把這個 port publish 到本機。
// 與 SubscribeController.redeem.test.js 的 assertLocalDockerMysql 同一手法；錯誤訊息不帶 env 值。
function assertLocalDockerMysql({ host, port }) {
  const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      "refuse: DB_HOST is not a local address; integration test needs local Docker MySQL"
    );
  }
  const publishedPort = String(port || 3306);
  if (!/^\d{1,5}$/.test(publishedPort)) {
    throw new Error("refuse: DB_PORT is not a plain port number");
  }
  let lines;
  try {
    lines = execFileSync(
      "docker",
      [
        "ps",
        "--filter",
        "status=running",
        "--filter",
        `publish=${publishedPort}`,
        "--format",
        "{{.Names}}\t{{.Image}}",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    )
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    throw new Error(
      `refuse: cannot confirm local Docker MySQL via docker ps (${error.code || "docker failed"})`,
      { cause: error }
    );
  }
  // image 欄位允許 registry 前綴：mysql / mysql:8 / docker.io/library/mysql:8.4
  const mysqlContainers = lines.filter(line => /\t([\w.-]+\/)*mysql(:|@|$)/i.test(line));
  if (!mysqlContainers.length) {
    throw new Error(
      `refuse: no running Docker container with a mysql image publishes port ${publishedPort}`
    );
  }
  return mysqlContainers.map(line => line.split("\t")[0]);
}
const DOCKER_MYSQL_CONTAINERS = assertLocalDockerMysql(dbConfig.connection);

const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../__tests__/helpers/worldBossFixture");
const testDatabase = createWorldBossTestDatabase("sponsorship");
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);

const Sponsorship = require("../../model/application/Sponsorship");
const SponsorshipAudit = require("../../model/application/SponsorshipAudit");
const SubscribeCardCoupon = require("../../model/application/SubscribeCardCoupon");
const SubscribeCardCouponService = require("../SubscribeCardCouponService");
const SponsorshipService = require("../SponsorshipService");

const realIssue = SubscribeCardCouponService.issue;
const DB_PREFIX = "Princess_wbtest_sponsorship_";
const users = {};

function operatorId() {
  return `U${crypto.randomBytes(16).toString("hex")}`;
}

function deferred() {
  let resolve;
  const promise = new Promise(r => {
    resolve = r;
  });
  return { promise, resolve };
}

function newInput(overrides = {}) {
  return {
    type: "new",
    user_id: users.a,
    currency: "TWD",
    amount: "600",
    received_at: "2026-09-12T11:23:00.000Z",
    payment_method: "LINE Pay",
    external_ref: null,
    note: null,
    card_key: "month",
    card_count: 12,
    ...overrides,
  };
}

function historyInput(overrides = {}) {
  return newInput({
    type: "history",
    user_id: null,
    card_key: null,
    card_count: 0,
    ...overrides,
  });
}

async function countsFor(requestId) {
  const sponsorships = await mysql("sponsorship").where({ request_id: requestId }).select("id");
  const ids = sponsorships.map(s => s.id);
  const [audits, coupons] = await Promise.all([
    ids.length ? mysql("sponsorship_audit").whereIn("sponsorship_id", ids) : [],
    ids.length ? mysql("subscribe_card_coupon").whereIn("sponsorship_id", ids) : [],
  ]);
  return { sponsorships, audits, coupons };
}

/**
 * 從 SHOW PROCESSLIST 找出本測試 DB 內、正在執行符合 pattern 的 SQL 的連線。
 * 這是「另一條交易確實已進入 SQL 並卡在鎖等待」的證據；sleep 只是輪詢間隔，不是證明。
 * 限制：app user 無 PROCESS 權限，看不到 innodb_trx/data_lock_waits，只能看自己的 thread。
 */
async function waitForOwnThreads(pattern, expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let matched = [];
  while (Date.now() < deadline) {
    const [rows] = await mysql.raw("SHOW PROCESSLIST");
    matched = rows.filter(
      r => r.db === testDatabase.databaseName && typeof r.Info === "string" && pattern.test(r.Info)
    );
    if (matched.length >= expected) return matched;
    await new Promise(r => setTimeout(r, 25));
  }
  return matched;
}

function settledFlag(promise) {
  const flag = { settled: false };
  promise.then(
    () => (flag.settled = true),
    () => (flag.settled = true)
  );
  return flag;
}

beforeAll(async () => {
  const connected = await testDatabase.setup();
  if (connected === "Princess" || !connected.startsWith(DB_PREFIX)) {
    throw new Error("Unsafe sponsorship test database");
  }
  for (const key of ["a", "b", "c"]) {
    const [id] = await mysql("user").insert({
      platform: "line",
      platform_id: `__sptest_${key}_${process.pid}`,
      display_name: `sp_${key}`,
    });
    users[key] = id;
  }
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  await testDatabase.teardown();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("migration smoke", () => {
  it("fresh DB migrates to latest with sponsorship schema, and is not Princess", async () => {
    expect(DOCKER_MYSQL_CONTAINERS.length).toBeGreaterThan(0); // 護欄已確認本機 Docker MySQL
    const [rows] = await mysql.raw("SELECT DATABASE() AS db");
    expect(rows[0].db).toBe(testDatabase.databaseName);
    expect(rows[0].db.startsWith(DB_PREFIX)).toBe(true);
    expect(rows[0].db).not.toBe("Princess");

    const [, pending] = await mysql.migrate.list();
    expect(pending).toEqual([]);

    expect(await mysql.schema.hasTable("sponsorship")).toBe(true);
    expect(await mysql.schema.hasTable("sponsorship_audit")).toBe(true);
    expect(await mysql.schema.hasColumn("subscribe_card_coupon", "sponsorship_id")).toBe(true);
    expect(await mysql("sponsorship").count({ c: "*" }).first()).toEqual({ c: 0 });
  });
});

describe("create", () => {
  it("card sponsorship: 1 sponsorship, 12 coupons linked, 1 create audit, no subscription", async () => {
    const requestId = crypto.randomUUID();
    const operator = operatorId();

    const result = await SponsorshipService.create(newInput(), requestId, operator);

    expect(result.created).toBe(true);
    expect(result.coupons).toHaveLength(12);

    const { sponsorships, audits, coupons } = await countsFor(requestId);
    expect(sponsorships).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "create", operator_user_id: operator });
    expect(coupons).toHaveLength(12);
    coupons.forEach(c => {
      expect(c).toMatchObject({
        sponsorship_id: result.sponsorship.id,
        subscribe_card_key: "month",
        status: SubscribeCardCoupon.status.unused,
        issued_by: operator,
        used_at: null,
        used_by: null,
      });
    });
    const dbSerials = coupons.map(c => c.serial_number).sort();
    expect(result.coupons.map(c => c.serial_number).sort()).toEqual(dbSerials);

    const raw = audits[0].payload_snapshot;
    const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect([...snapshot.serial_numbers].sort()).toEqual(dbSerials);

    // 發卡本身不啟用訂閱
    expect(await mysql("subscribe_user").count({ c: "*" }).first()).toEqual({ c: 0 });
    expect(result.sponsorship).toMatchObject({
      user_id: users.a,
      amount: "600.00",
      card_key: "month",
      card_count: 12,
    });
  });

  it("plain sponsorship and history produce no coupons", async () => {
    const plainId = crypto.randomUUID();
    const historyId = crypto.randomUUID();

    await SponsorshipService.create(
      newInput({ card_key: null, card_count: 0 }),
      plainId,
      operatorId()
    );
    await SponsorshipService.create(historyInput(), historyId, operatorId());

    const plain = await countsFor(plainId);
    expect(plain.sponsorships).toHaveLength(1);
    expect(plain.audits).toHaveLength(1);
    expect(plain.coupons).toEqual([]);

    const history = await countsFor(historyId);
    expect(history.sponsorships).toHaveLength(1);
    expect(history.audits).toHaveLength(1);
    expect(history.coupons).toEqual([]);
    const row = await Sponsorship.find(history.sponsorships[0].id);
    expect(row).toMatchObject({ type: "history", user_id: null, card_count: 0, card_key: null });
  });

  it("rolls back everything when issue fails after writing part of the coupons (real dup key)", async () => {
    const requestId = crypto.randomUUID();
    const operator = operatorId();
    const dupSerial = crypto.randomUUID();
    await SubscribeCardCoupon.insert([
      { subscribe_card_key: "month", serial_number: dupSerial, status: 0, issued_by: "seed" },
    ]);

    let partialInsideTrx = null;
    jest
      .spyOn(SubscribeCardCouponService, "issue")
      .mockImplementationOnce(async ({ cardKey, issuedBy, sponsorshipId }, trx) => {
        const rows = Array.from({ length: 5 }).map(() => ({
          subscribe_card_key: cardKey,
          serial_number: crypto.randomUUID(),
          status: 0,
          issued_by: issuedBy,
          sponsorship_id: sponsorshipId,
        }));
        await SubscribeCardCoupon.insert(rows, trx);
        const seen = await trx("subscribe_card_coupon")
          .where({ issued_by: issuedBy })
          .count({ c: "*" })
          .first();
        partialInsideTrx = Number(seen.c);
        // 第 6 張撞既有序號 → 真實 ER_DUP_ENTRY（非 request_id 唯一鍵，不得被當冪等吞掉）
        await SubscribeCardCoupon.insert(
          [{ ...rows[0], serial_number: dupSerial, sponsorship_id: sponsorshipId }],
          trx
        );
      });

    await expect(SponsorshipService.create(newInput(), requestId, operator)).rejects.toMatchObject({
      code: "ER_DUP_ENTRY",
    });

    expect(partialInsideTrx).toBe(5);
    const { sponsorships, audits, coupons } = await countsFor(requestId);
    expect(sponsorships).toEqual([]);
    expect(audits).toEqual([]);
    expect(coupons).toEqual([]);
    expect(await mysql("subscribe_card_coupon").where({ issued_by: operator })).toEqual([]);
    expect(await mysql("sponsorship_audit").where({ operator_user_id: operator })).toEqual([]);
  });

  it("rolls back sponsorship and all coupons when create audit fails", async () => {
    const requestId = crypto.randomUUID();
    const operator = operatorId();
    const insideTrx = {};

    jest.spyOn(SponsorshipAudit, "create").mockImplementationOnce(async (attrs, trx) => {
      insideTrx.sponsorship = await trx("sponsorship").where({ request_id: requestId });
      insideTrx.coupons = await trx("subscribe_card_coupon").where({
        sponsorship_id: attrs.sponsorship_id,
      });
      throw new Error("AUDIT_BOOM");
    });

    await expect(SponsorshipService.create(newInput(), requestId, operator)).rejects.toThrow(
      "AUDIT_BOOM"
    );

    expect(insideTrx.sponsorship).toHaveLength(1);
    expect(insideTrx.coupons).toHaveLength(12);
    const { sponsorships, audits, coupons } = await countsFor(requestId);
    expect(sponsorships).toEqual([]);
    expect(audits).toEqual([]);
    expect(coupons).toEqual([]);
    expect(await mysql("subscribe_card_coupon").where({ issued_by: operator })).toEqual([]);
  });

  it("concurrent same key + same payload: exactly one row set; loser gets created=false", async () => {
    const requestId = crypto.randomUUID();
    const operator = operatorId();
    const reachedIssue = deferred();
    const release = deferred();

    jest.spyOn(SubscribeCardCouponService, "issue").mockImplementationOnce(async (args, trx) => {
      reachedIssue.resolve();
      await release.promise;
      return realIssue(args, trx);
    });

    let first;
    let second;
    let waiting;
    let secondFlag;
    try {
      first = SponsorshipService.create(newInput(), requestId, operator);
      await reachedIssue.promise; // T1 已 INSERT sponsorship、尚未 commit
      second = SponsorshipService.create(newInput(), requestId, operator);
      secondFlag = settledFlag(second);

      waiting = await waitForOwnThreads(/^insert into `sponsorship`/i, 1);
      // 交易外看不到未 commit 的列
      expect(await mysql("sponsorship").where({ request_id: requestId })).toEqual([]);
      expect(secondFlag.settled).toBe(false);
    } finally {
      release.resolve();
    }

    expect(waiting).toHaveLength(1); // T2 卡在 unique(request_id) 的 INSERT 鎖等待

    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
    expect(r2.sponsorship.id).toBe(r1.sponsorship.id);
    expect(r2.coupons.map(c => c.serial_number).sort()).toEqual(
      r1.coupons.map(c => c.serial_number).sort()
    );

    const { sponsorships, audits, coupons } = await countsFor(requestId);
    expect(sponsorships).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(coupons).toHaveLength(12);

    // 事後重送（非併發）同樣回原結果、不新增任何列
    const r3 = await SponsorshipService.create(newInput(), requestId, operator);
    expect(r3.created).toBe(false);
    expect(r3.sponsorship.id).toBe(r1.sponsorship.id);
    const again = await countsFor(requestId);
    expect([again.sponsorships.length, again.audits.length, again.coupons.length]).toEqual([
      1, 1, 12,
    ]);
  });

  it("same key + different payload: CONFLICT, original untouched", async () => {
    const requestId = crypto.randomUUID();
    const operator = operatorId();
    const r1 = await SponsorshipService.create(newInput(), requestId, operator);

    await expect(
      SponsorshipService.create(newInput({ amount: "601" }), requestId, operator)
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const { sponsorships, audits, coupons } = await countsFor(requestId);
    expect(sponsorships).toEqual([{ id: r1.sponsorship.id }]);
    expect(audits).toHaveLength(1);
    expect(coupons).toHaveLength(12);
    expect((await Sponsorship.find(r1.sponsorship.id)).amount).toBe("600.00");
  });
});

describe("bind", () => {
  it("keeps sponsorship unbound when bind audit fails after the UPDATE", async () => {
    const requestId = crypto.randomUUID();
    const created = await SponsorshipService.create(historyInput(), requestId, operatorId());
    const id = created.sponsorship.id;
    let insideTrx;

    jest.spyOn(SponsorshipAudit, "create").mockImplementationOnce(async (attrs, trx) => {
      insideTrx = await trx("sponsorship").where({ id }).first();
      throw new Error("BIND_AUDIT_BOOM");
    });

    await expect(SponsorshipService.bind(id, users.b, operatorId())).rejects.toThrow(
      "BIND_AUDIT_BOOM"
    );

    expect(insideTrx.user_id).toBe(users.b); // UPDATE 確實在交易內發生過
    const row = await Sponsorship.find(id);
    expect(row.user_id).toBeNull();
    expect(row.bound_at).toBeNull();
    expect(await SponsorshipAudit.listBySponsorship(id)).toHaveLength(1); // 只有 create
  });

  it("concurrent bind to same target: one bind audit; later bind to other user rejected", async () => {
    const requestId = crypto.randomUUID();
    const created = await SponsorshipService.create(historyInput(), requestId, operatorId());
    const id = created.sponsorship.id;

    // 外部 holder 先鎖住該列，讓兩個 bind 同時卡在 lockById（FOR UPDATE）上
    const holder = await mysql.transaction();
    let first;
    let second;
    let waiting;
    try {
      await holder("sponsorship").where({ id }).forUpdate().first();
      first = SponsorshipService.bind(id, users.b, operatorId());
      second = SponsorshipService.bind(id, users.b, operatorId());
      waiting = await waitForOwnThreads(/^select \* from `sponsorship` where .* for update$/i, 2);
    } finally {
      await holder.commit();
    }
    expect(waiting).toHaveLength(2); // 兩條 bind 交易都已進入 SQL 並在等同一把列鎖

    const results = await Promise.all([first, second]);
    expect(results.map(r => r.bound).sort()).toEqual([false, true]);

    const row = await Sponsorship.find(id);
    expect(row.user_id).toBe(users.b);
    expect(row.bound_at).toBeInstanceOf(Date);
    const audits = await SponsorshipAudit.listBySponsorship(id);
    expect(audits.map(a => a.action)).toEqual(["create", "bind"]);

    await expect(SponsorshipService.bind(id, users.c, operatorId())).rejects.toMatchObject({
      code: "ALREADY_BOUND_OTHER",
    });
    expect((await Sponsorship.find(id)).user_id).toBe(users.b);
    expect(await SponsorshipAudit.listBySponsorship(id)).toHaveLength(2);

    // 補綁不產生序號
    expect(await mysql("subscribe_card_coupon").where({ sponsorship_id: id })).toEqual([]);
  });
});

describe("amounts and timestamps", () => {
  it("player summary sums DECIMAL in SQL and returns an exact string", async () => {
    const operator = operatorId();
    for (const amount of ["0.10", "0.20", "1000000.01"]) {
      await SponsorshipService.create(
        newInput({ user_id: users.c, amount, card_key: null, card_count: 0 }),
        crypto.randomUUID(),
        operator
      );
    }
    const summary = await SponsorshipService.getPlayerSummary(users.c);
    expect(summary.totalAmount).toBe("1000000.31"); // float 加總會是 1000000.3100000001
    expect(summary.sponsorships.map(s => s.amount).sort()).toEqual(["0.10", "0.20", "1000000.01"]);
  });

  it("received_at round-trips as the same UTC instant across the +08:00 day boundary", async () => {
    const cases = [
      // UTC 23:30 → 台北隔日 07:30
      {
        input: "2026-09-12T23:30:00.000Z",
        utc: "2026-09-12T23:30:00.000Z",
        wall: "2026-09-13 07:30:00",
      },
      // 台北 01:00 → UTC 前一日 17:00
      {
        input: "2026-09-13T01:00:00+08:00",
        utc: "2026-09-12T17:00:00.000Z",
        wall: "2026-09-13 01:00:00",
      },
    ];
    for (const { input, utc, wall } of cases) {
      const requestId = crypto.randomUUID();
      const { sponsorship } = await SponsorshipService.create(
        newInput({ received_at: input, card_key: null, card_count: 0 }),
        requestId,
        operatorId()
      );
      expect(sponsorship.received_at).toBeInstanceOf(Date);
      expect(sponsorship.received_at.toISOString()).toBe(utc);

      const [[raw]] = await mysql.raw(
        "SELECT DATE_FORMAT(received_at, '%Y-%m-%d %H:%i:%s') AS wall FROM sponsorship WHERE id = ?",
        [sponsorship.id]
      );
      expect(raw.wall).toBe(wall); // session tz +08:00 牆鐘

      // 同一瞬間、不同 offset 寫法 → 同 fingerprint → 冪等回原結果
      const alt = utc.replace(".000Z", "Z");
      const resend = await SponsorshipService.create(
        newInput({ received_at: alt, card_key: null, card_count: 0 }),
        requestId,
        operatorId()
      );
      expect(resend.created).toBe(false);
      expect(resend.sponsorship.id).toBe(sponsorship.id);
    }
  });
});
