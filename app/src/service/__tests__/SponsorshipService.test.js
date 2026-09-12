// SponsorshipService 的輸入驗證、指紋計算、冪等/補綁決策測試。
// model 層全部 mock，測的是 service 的決策分支，不是交易/併發（那是 integration test 的範圍）。

jest.mock("../../model/application/Sponsorship", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findByRequestId: jest.fn(),
  sumAmountByUser: jest.fn(),
  listByUser: jest.fn(),
  search: jest.fn(),
  countSearch: jest.fn(),
  lockById: jest.fn(),
}));

jest.mock("../../model/application/SponsorshipAudit", () => ({
  create: jest.fn(),
  findByAction: jest.fn(),
}));

jest.mock("../../model/application/SubscribeCard", () => ({
  all: jest.fn(),
}));

jest.mock("../../model/application/UserModel", () => ({
  findById: jest.fn(),
}));

jest.mock("../SubscribeCardCouponService", () => ({
  issue: jest.fn(),
  MAX_ISSUE_COUNT: 100,
  ALLOWED_KEYS: new Set(["month", "season"]),
}));

const Service = require("../SponsorshipService");
const Sponsorship = require("../../model/application/Sponsorship");
const SponsorshipAudit = require("../../model/application/SponsorshipAudit");
const UserModel = require("../../model/application/UserModel");
const SubscribeCardCouponService = require("../SubscribeCardCouponService");

const VALID_NEW_INPUT = {
  type: "new",
  user_id: 42,
  currency: "TWD",
  amount: "1500.00",
  received_at: "2026-09-09T10:00:00+08:00",
  payment_method: "bank_transfer",
  external_ref: null,
  note: null,
  card_key: null,
  card_count: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  UserModel.findById.mockResolvedValue({ id: 42, platform_id: "U" + "1".repeat(32) });
  Sponsorship.create.mockResolvedValue(1);
  Sponsorship.find.mockResolvedValue({
    id: 1,
    request_id: "req-1",
    fingerprint: "fp",
    ...VALID_NEW_INPUT,
    operator_user_id: "Uowner",
    bound_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  });
  SponsorshipAudit.create.mockResolvedValue(1);
});

describe("金額驗證（normalizeAmount）", () => {
  it.each(["1500.00", "1500", "1500.5", "0.01", "9999999999.99"])("接受合法金額字串 %s", amount => {
    expect(() => Service.normalizeAmount(amount)).not.toThrow();
  });

  it.each([
    ["0", "INVALID_AMOUNT"],
    ["0.00", "INVALID_AMOUNT"],
    ["-1", "INVALID_AMOUNT"],
    ["-1500.00", "INVALID_AMOUNT"],
    ["1500.001", "INVALID_AMOUNT"],
    ["abc", "INVALID_AMOUNT"],
    ["1500元", "INVALID_AMOUNT"],
    ["", "INVALID_AMOUNT"],
    [null, "INVALID_AMOUNT"],
    [undefined, "INVALID_AMOUNT"],
    [1500, "INVALID_AMOUNT"], // 只接受十進位字串，不接受 number
    ["1e3", "INVALID_AMOUNT"],
    ["NaN", "INVALID_AMOUNT"],
    ["Infinity", "INVALID_AMOUNT"],
  ])("拒絕 %p", (amount, code) => {
    expect(() => Service.normalizeAmount(amount)).toThrow();
    try {
      Service.normalizeAmount(amount);
    } catch (e) {
      expect(e.code).toBe(code);
    }
  });

  it("正規化為固定兩位小數字串", () => {
    expect(Service.normalizeAmount("1500")).toBe("1500.00");
    expect(Service.normalizeAmount("1500.5")).toBe("1500.50");
    expect(Service.normalizeAmount("1500.00")).toBe("1500.00");
  });
});

describe("建立輸入驗證（normalizeCreateInput）", () => {
  it("接受合法的 new 型輸入", () => {
    expect(() => Service.normalizeCreateInput(VALID_NEW_INPUT)).not.toThrow();
  });

  it("拒絕未知欄位（reject unknown fields，不靜默忽略）", () => {
    expect(() => Service.normalizeCreateInput({ ...VALID_NEW_INPUT, extra_field: "x" })).toThrow();
    try {
      Service.normalizeCreateInput({ ...VALID_NEW_INPUT, extra_field: "x" });
    } catch (e) {
      expect(e.code).toBe("UNKNOWN_FIELD");
      expect(e.fields).toEqual(["extra_field"]);
    }
  });

  it("拒絕不合法的 type", () => {
    expect(() => Service.normalizeCreateInput({ ...VALID_NEW_INPUT, type: "refund" })).toThrow();
  });

  it("拒絕非 TWD 幣別", () => {
    expect(() => Service.normalizeCreateInput({ ...VALID_NEW_INPUT, currency: "USD" })).toThrow();
  });

  it("new 型缺 user_id 時拒絕（USER_REQUIRED）", () => {
    expect(() => {
      Service.normalizeCreateInput({ ...VALID_NEW_INPUT, user_id: null });
    }).toThrow();
    try {
      Service.normalizeCreateInput({ ...VALID_NEW_INPUT, user_id: null });
    } catch (e) {
      expect(e.code).toBe("USER_REQUIRED");
    }
  });

  it("history 型可以不填 user_id（未綁定）", () => {
    const input = { ...VALID_NEW_INPUT, type: "history", user_id: null };
    expect(() => Service.normalizeCreateInput(input)).not.toThrow();
  });

  it("history 型帶 card_count > 0 一律拒絕（不發卡）", () => {
    const input = {
      ...VALID_NEW_INPUT,
      type: "history",
      user_id: null,
      card_count: 1,
      card_key: "month",
    };
    expect(() => Service.normalizeCreateInput(input)).toThrow();
    try {
      Service.normalizeCreateInput(input);
    } catch (e) {
      expect(e.code).toBe("HISTORY_CANNOT_ISSUE_CARD");
    }
  });

  it("history 型帶 card_key（即使 card_count=0）一律拒絕", () => {
    const input = { ...VALID_NEW_INPUT, type: "history", user_id: null, card_key: "month" };
    expect(() => Service.normalizeCreateInput(input)).toThrow();
  });

  it("card_count 上限：超過 MAX_CARD_COUNT 一律拒絕", () => {
    const input = { ...VALID_NEW_INPUT, card_count: 101, card_key: "month" };
    expect(() => Service.normalizeCreateInput(input)).toThrow();
    try {
      Service.normalizeCreateInput(input);
    } catch (e) {
      expect(e.code).toBe("INVALID_CARD_COUNT");
    }
  });

  it.each([-1, 1.5, "abc", NaN])("card_count 拒絕非法值 %p", cardCount => {
    expect(() =>
      Service.normalizeCreateInput({ ...VALID_NEW_INPUT, card_count: cardCount, card_key: "month" })
    ).toThrow();
  });

  it("card_count > 0 但缺 card_key 時拒絕", () => {
    expect(() =>
      Service.normalizeCreateInput({ ...VALID_NEW_INPUT, card_count: 3, card_key: null })
    ).toThrow();
  });

  it("card_key 不在允許清單內時拒絕", () => {
    expect(() =>
      Service.normalizeCreateInput({ ...VALID_NEW_INPUT, card_count: 1, card_key: "lifetime" })
    ).toThrow();
  });

  it("缺省/null/空字串的選填欄位一律 normalize 為 null", () => {
    const result = Service.normalizeCreateInput({
      ...VALID_NEW_INPUT,
      payment_method: "",
      external_ref: undefined,
      note: null,
    });
    expect(result.payment_method).toBeNull();
    expect(result.external_ref).toBeNull();
    expect(result.note).toBeNull();
  });

  it("received_at 正規化為 UTC 秒精度 ISO 字串", () => {
    const result = Service.normalizeCreateInput({
      ...VALID_NEW_INPUT,
      received_at: "2026-09-09T10:00:00.123+08:00",
    });
    expect(result.received_at).toBe("2026-09-09T02:00:00Z");
  });
});

describe("指紋計算（computeFingerprint）", () => {
  it("同樣的正規化輸入產生同樣的指紋（決定性）", () => {
    const a = Service.normalizeCreateInput(VALID_NEW_INPUT);
    const b = Service.normalizeCreateInput({ ...VALID_NEW_INPUT });
    expect(Service.computeFingerprint(a)).toBe(Service.computeFingerprint(b));
  });

  it("任何欄位不同都會改變指紋", () => {
    const a = Service.normalizeCreateInput(VALID_NEW_INPUT);
    const b = Service.normalizeCreateInput({ ...VALID_NEW_INPUT, amount: "1500.01" });
    expect(Service.computeFingerprint(a)).not.toBe(Service.computeFingerprint(b));
  });

  it("是 64 字元 hex（SHA-256）", () => {
    const a = Service.normalizeCreateInput(VALID_NEW_INPUT);
    expect(Service.computeFingerprint(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("建立（create）：新玩家驗證", () => {
  it("new 型玩家不存在時拒絕（不得用 ensureUser 自動建號）", async () => {
    UserModel.findById.mockResolvedValue(null);

    await expect(Service.create(VALID_NEW_INPUT, "req-1", "Uowner")).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
    });
    expect(Sponsorship.create).not.toHaveBeenCalled();
  });

  it("純贊助（card_count=0）不呼叫 issue，不產生序號", async () => {
    const result = await Service.create(VALID_NEW_INPUT, "req-1", "Uowner");

    expect(SubscribeCardCouponService.issue).not.toHaveBeenCalled();
    expect(result.coupons).toEqual([]);
    expect(result.created).toBe(true);
  });

  it(
    "regression：Sponsorship.create 收到的 received_at 是 Date instance（非 canonical 字串），" +
      "避免 mysql2 strict mode 對 DATETIME 欄位丟 ER_TRUNCATED_WRONG_VALUE(1292)；" +
      "audit payload_snapshot 的 canonical 字串維持不變",
    async () => {
      await Service.create(VALID_NEW_INPUT, "req-1", "Uowner");

      const insertPayload = Sponsorship.create.mock.calls[0][0];
      expect(insertPayload.received_at).toBeInstanceOf(Date);
      expect(insertPayload.received_at.toISOString()).toBe("2026-09-09T02:00:00.000Z");

      const auditPayload = SponsorshipAudit.create.mock.calls[0][0];
      const snapshot = JSON.parse(auditPayload.payload_snapshot);
      // audit/fingerprint 仍是 normalizeCreateInput 的 canonical ISO 字串，不受入庫轉型影響。
      expect(snapshot.received_at).toBe("2026-09-09T02:00:00Z");
    }
  );

  it("發卡贊助：同一交易內先建 sponsorship 再 issue 再寫 audit(create)", async () => {
    SubscribeCardCouponService.issue.mockResolvedValue([
      { serial_number: "s1" },
      { serial_number: "s2" },
    ]);

    const callOrder = [];
    Sponsorship.create.mockImplementation(async () => {
      callOrder.push("sponsorship.create");
      return 1;
    });
    SubscribeCardCouponService.issue.mockImplementation(async () => {
      callOrder.push("issue");
      return [{ serial_number: "s1" }];
    });
    SponsorshipAudit.create.mockImplementation(async () => {
      callOrder.push("audit.create");
      return 1;
    });

    const input = { ...VALID_NEW_INPUT, card_count: 1, card_key: "month" };
    const result = await Service.create(input, "req-1", "Uowner");

    expect(callOrder).toEqual(["sponsorship.create", "issue", "audit.create"]);
    expect(SubscribeCardCouponService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ cardKey: "month", count: 1, issuedBy: "Uowner", sponsorshipId: 1 }),
      expect.anything()
    );
    expect(result.created).toBe(true);
  });

  it("history 型不驗證/不需要 user_id 存在（未綁定）", async () => {
    const input = { ...VALID_NEW_INPUT, type: "history", user_id: null };
    UserModel.findById.mockClear();

    await Service.create(input, "req-1", "Uowner");

    expect(UserModel.findById).not.toHaveBeenCalled();
  });
});

describe("建立（create）：冪等處理", () => {
  function duplicateEntryError() {
    return Object.assign(new Error("Duplicate entry"), {
      code: "ER_DUP_ENTRY",
      sqlMessage: "Duplicate entry 'req-1' for key 'sponsorship.sponsorship_request_id_unique'",
    });
  }

  it("同一 request_id 重送、內容相同（fingerprint 相同）時回原本結果", async () => {
    Sponsorship.create.mockRejectedValue(duplicateEntryError());
    const normalized = Service.normalizeCreateInput(VALID_NEW_INPUT);
    const fingerprint = Service.computeFingerprint(normalized);
    Sponsorship.findByRequestId.mockResolvedValue({
      id: 5,
      request_id: "req-1",
      fingerprint,
      card_count: 0,
    });

    const result = await Service.create(VALID_NEW_INPUT, "req-1", "Uowner");

    expect(result.created).toBe(false);
    expect(result.sponsorship.id).toBe(5);
  });

  it("同一 request_id 重送、內容不同（fingerprint 不同）時回 409/CONFLICT", async () => {
    Sponsorship.create.mockRejectedValue(duplicateEntryError());
    Sponsorship.findByRequestId.mockResolvedValue({
      id: 5,
      request_id: "req-1",
      fingerprint: "different-fingerprint",
      card_count: 0,
    });

    await expect(Service.create(VALID_NEW_INPUT, "req-1", "Uowner")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("唯一鍵衝突但交易外查無此 request_id 時仍視為衝突（不應發生，但防禦性拒絕）", async () => {
    Sponsorship.create.mockRejectedValue(duplicateEntryError());
    Sponsorship.findByRequestId.mockResolvedValue(null);

    await expect(Service.create(VALID_NEW_INPUT, "req-1", "Uowner")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("非唯一鍵衝突的其他錯誤直接拋出，不吞成冪等回應", async () => {
    Sponsorship.create.mockRejectedValue(new Error("connection lost"));

    await expect(Service.create(VALID_NEW_INPUT, "req-1", "Uowner")).rejects.toThrow(
      "connection lost"
    );
    expect(Sponsorship.findByRequestId).not.toHaveBeenCalled();
  });

  it("sentinel：Knex 例外 message/sqlMessage 帶假金額/序號時，DefaultLogger.error 絕不能印出該原始字串", async () => {
    const { DefaultLogger } = require("../../util/Logger");
    const SENTINEL_AMOUNT = "7777777.77";
    const SENTINEL_SERIAL = "ffffffff-0000-1111-2222-333333333333";
    const sqlLikeError = Object.assign(
      new Error(
        `insert into sponsorship (amount, external_ref) values (${SENTINEL_AMOUNT}, '${SENTINEL_SERIAL}')`
      ),
      {
        code: "ER_LOCK_WAIT_TIMEOUT",
        sqlMessage: `Lock wait timeout amount=${SENTINEL_AMOUNT} ref=${SENTINEL_SERIAL}`,
      }
    );
    Sponsorship.create.mockRejectedValue(sqlLikeError);

    await expect(Service.create(VALID_NEW_INPUT, "req-1", "Uowner")).rejects.toThrow();

    const loggedText = DefaultLogger.error.mock.calls
      .map(args => args.map(a => JSON.stringify(a)).join(" "))
      .join("\n");
    expect(loggedText).not.toContain(SENTINEL_AMOUNT);
    expect(loggedText).not.toContain(SENTINEL_SERIAL);
  });
});

describe("補綁（bind）：狀態機", () => {
  function historyRow(overrides = {}) {
    return {
      id: 10,
      type: "history",
      user_id: null,
      bound_at: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    Sponsorship.lockById.mockResolvedValue(historyRow());
  });

  it("未綁定 -> 綁成功，寫入一筆 audit(bind)", async () => {
    const result = await Service.bind(10, 42, "Uowner");

    expect(result.bound).toBe(true);
    expect(SponsorshipAudit.create).toHaveBeenCalledTimes(1);
    expect(SponsorshipAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ sponsorship_id: 10, action: "bind", operator_user_id: "Uowner" }),
      expect.anything()
    );
  });

  it("已綁定，重送同一 target：不產生第二筆 audit，直接回傳現況", async () => {
    Sponsorship.lockById.mockResolvedValue(historyRow({ user_id: 42, bound_at: new Date() }));

    const result = await Service.bind(10, 42, "Uowner");

    expect(result.bound).toBe(false);
    expect(SponsorshipAudit.create).not.toHaveBeenCalled();
  });

  it("已綁定，target 是別人：回 409/ALREADY_BOUND_OTHER，不覆蓋", async () => {
    Sponsorship.lockById.mockResolvedValue(historyRow({ user_id: 42, bound_at: new Date() }));

    await expect(Service.bind(10, 99, "Uowner")).rejects.toMatchObject({
      code: "ALREADY_BOUND_OTHER",
    });
    expect(SponsorshipAudit.create).not.toHaveBeenCalled();
  });

  it("非 history 型（new）不可補綁", async () => {
    Sponsorship.lockById.mockResolvedValue(historyRow({ type: "new", user_id: 42 }));

    await expect(Service.bind(10, 42, "Uowner")).rejects.toMatchObject({
      code: "NOT_HISTORY_TYPE",
    });
  });

  it("查無此贊助紀錄回 SPONSORSHIP_NOT_FOUND", async () => {
    Sponsorship.lockById.mockResolvedValue(null);

    await expect(Service.bind(999, 42, "Uowner")).rejects.toMatchObject({
      code: "SPONSORSHIP_NOT_FOUND",
    });
  });

  it("target 玩家不存在時拒絕", async () => {
    UserModel.findById.mockResolvedValue(null);

    await expect(Service.bind(10, 999, "Uowner")).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
    });
  });

  it("target user_id 不合法時拒絕", async () => {
    await expect(Service.bind(10, -1, "Uowner")).rejects.toMatchObject({
      code: "INVALID_USER_ID",
    });
    await expect(Service.bind(10, "abc", "Uowner")).rejects.toMatchObject({
      code: "INVALID_USER_ID",
    });
  });
});
