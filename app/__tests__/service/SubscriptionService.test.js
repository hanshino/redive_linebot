// SubscriptionService.hasEffect — unit tests covering active/expired/no-sub/malformed cases.

jest.mock("../../src/model/application/SubscribeUser", () => ({
  all: jest.fn(),
}));
jest.mock("../../src/model/application/SubscribeCard", () => ({
  first: jest.fn(),
  SUPERSEDED_BY: { month: ["month_plus"] },
}));

const SubscribeUser = require("../../src/model/application/SubscribeUser");
const SubscribeCard = require("../../src/model/application/SubscribeCard");
const SubscriptionService = require("../../src/service/SubscriptionService");

describe("SubscriptionService.hasEffect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns true when active subscription card includes the effect", async () => {
    SubscribeUser.all.mockResolvedValue([{ subscribe_card_key: "month" }]);
    SubscribeCard.first.mockResolvedValue({
      effects: [
        { type: "gacha_times", value: 1 },
        { type: "auto_daily_gacha", value: 1 },
      ],
    });

    const result = await SubscriptionService.hasEffect("Uabc", "auto_daily_gacha");
    expect(result).toBe(true);
  });

  it("returns false when active subscription card does NOT include the effect", async () => {
    SubscribeUser.all.mockResolvedValue([{ subscribe_card_key: "month" }]);
    SubscribeCard.first.mockResolvedValue({
      effects: [{ type: "gacha_times", value: 1 }],
    });

    const result = await SubscriptionService.hasEffect("Uabc", "auto_daily_gacha");
    expect(result).toBe(false);
  });

  it("returns false when user has no active subscription", async () => {
    SubscribeUser.all.mockResolvedValue([]);

    const result = await SubscriptionService.hasEffect("Uabc", "auto_daily_gacha");
    expect(result).toBe(false);
    expect(SubscribeCard.first).not.toHaveBeenCalled();
  });

  it("returns false (and does not throw) when card.effects is malformed JSON string", async () => {
    SubscribeUser.all.mockResolvedValue([{ subscribe_card_key: "month" }]);
    SubscribeCard.first.mockResolvedValue({ effects: "{{{not-json" });

    const result = await SubscriptionService.hasEffect("Uabc", "auto_daily_gacha");
    expect(result).toBe(false);
  });

  it("parses JSON-string effects and detects matching type", async () => {
    SubscribeUser.all.mockResolvedValue([{ subscribe_card_key: "season" }]);
    SubscribeCard.first.mockResolvedValue({
      effects: JSON.stringify([{ type: "auto_janken_fate", value: 1 }]),
    });

    const result = await SubscriptionService.hasEffect("Uabc", "auto_janken_fate");
    expect(result).toBe(true);
  });

  it("returns false when required args are missing", async () => {
    expect(await SubscriptionService.hasEffect("", "auto_daily_gacha")).toBe(false);
    expect(await SubscriptionService.hasEffect("Uabc", "")).toBe(false);
    expect(SubscribeUser.all).not.toHaveBeenCalled();
  });

  it("scans all active subscriptions when the first card does not have the effect", async () => {
    SubscribeUser.all.mockResolvedValue([
      { subscribe_card_key: "month" },
      { subscribe_card_key: "season" },
    ]);
    SubscribeCard.first
      .mockResolvedValueOnce({ effects: [{ type: "gacha_times", value: 1 }] })
      .mockResolvedValueOnce({ effects: [{ type: "auto_daily_gacha", value: 1 }] });

    const result = await SubscriptionService.hasEffect("Uabc", "auto_daily_gacha");
    expect(result).toBe(true);
    expect(SubscribeCard.first).toHaveBeenCalledTimes(2);
  });
});

describe("SubscriptionService.resolveActive", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const day = 86400000;
  const row = (key, startOffsetMs, endOffsetMs) => ({
    subscribe_card_key: key,
    start_at: new Date(+now + startOffsetMs),
    end_at: new Date(+now + endOffsetMs),
  });

  it("returns nothing paused when only month is active (no Plus present)", () => {
    const rows = [row("month", -day, day)];
    const result = SubscriptionService.resolveActive(rows, now);
    expect(result).toEqual([
      expect.objectContaining({
        subscribe_card_key: "month",
        paused: false,
        supersededByEndAt: null,
      }),
    ]);
  });

  it("marks month as paused when month_plus is concurrently active, and does not touch end_at", () => {
    const rows = [row("month", -day, day), row("month_plus", -1, day * 2)];
    const result = SubscriptionService.resolveActive(rows, now);
    const month = result.find(r => r.subscribe_card_key === "month");
    const plus = result.find(r => r.subscribe_card_key === "month_plus");
    expect(month.paused).toBe(true);
    expect(month.end_at).toEqual(new Date(+now + day)); // 倒數不受影響
    expect(month.supersededByEndAt).toEqual(new Date(+now + day * 2));
    expect(plus.paused).toBe(false);
  });

  it("never pauses season — season stacks with Plus per existing promise", () => {
    const rows = [row("season", -day, day), row("month_plus", -1, day)];
    const result = SubscriptionService.resolveActive(rows, now);
    const season = result.find(r => r.subscribe_card_key === "season");
    expect(season.paused).toBe(false);
    expect(season.supersededByEndAt).toBeNull();
  });

  it("excludes rows outside the half-open [start_at, end_at) boundary", () => {
    const rows = [
      row("month", -day, 0), // end_at === now → excluded (upper bound exclusive)
      row("season", 0, day), // start_at === now → included (lower bound inclusive)
      row("month_plus", day, day * 2), // starts in the future → excluded
    ];
    const result = SubscriptionService.resolveActive(rows, now);
    expect(result.map(r => r.subscribe_card_key)).toEqual(["season"]);
  });

  it("month is not paused once its overriding Plus has expired", () => {
    const rows = [row("month", -day, day), row("month_plus", -day * 2, -1)];
    const result = SubscriptionService.resolveActive(rows, now);
    const month = result.find(r => r.subscribe_card_key === "month");
    expect(month.paused).toBe(false);
  });

  it("returns an empty array for an empty/nullish input", () => {
    expect(SubscriptionService.resolveActive([], now)).toEqual([]);
    expect(SubscriptionService.resolveActive(undefined, now)).toEqual([]);
  });
});

describe("SubscriptionService.convertDurationByPrice", () => {
  const day = 86400000;

  it("converts remaining month time to Plus time at the current 30/60 = 1/2 ratio", () => {
    // 月卡剩 10 天折算進 Plus：10 天 × (30/60) = 5 天。
    expect(SubscriptionService.convertDurationByPrice(10 * day, 30, 60)).toBe(5 * day);
  });

  it("converts month duration into Plus at the same ratio when Plus absorbs month", () => {
    // 月卡整段 30 天折算進 Plus：30 天 × (30/60) = 15 天。
    expect(SubscriptionService.convertDurationByPrice(30 * day, 30, 60)).toBe(15 * day);
  });

  it("is precise to the millisecond (no rounding)", () => {
    // 1 天 × (30/60) = 12 小時整；換一個不整除的例子驗證真的沒有四捨五入。
    expect(SubscriptionService.convertDurationByPrice(day, 30, 60)).toBe(12 * 60 * 60 * 1000);
    expect(SubscriptionService.convertDurationByPrice(1000, 1, 3)).toBeCloseTo(333.333, 2);
  });

  it("returns 0 when the remaining duration is zero or negative (already expired / exactly due)", () => {
    expect(SubscriptionService.convertDurationByPrice(0, 30, 60)).toBe(0);
    expect(SubscriptionService.convertDurationByPrice(-1, 30, 60)).toBe(0);
  });

  it("returns 0 when either price is missing, zero, or negative (fail closed)", () => {
    expect(SubscriptionService.convertDurationByPrice(10 * day, 0, 60)).toBe(0);
    expect(SubscriptionService.convertDurationByPrice(10 * day, 30, 0)).toBe(0);
    expect(SubscriptionService.convertDurationByPrice(10 * day, null, 60)).toBe(0);
    expect(SubscriptionService.convertDurationByPrice(10 * day, 30, undefined)).toBe(0);
    expect(SubscriptionService.convertDurationByPrice(10 * day, -30, 60)).toBe(0);
  });

  it("bulk pricing (5-pack, both at the same 8% discount) keeps the ratio unchanged", () => {
    // 五張裝：月卡 120/5=24、Plus 240/5=48 —— 比例仍是 1/2。
    expect(SubscriptionService.convertDurationByPrice(10 * day, 24, 48)).toBe(5 * day);
  });
});

describe("SubscriptionService.keysSupersededBy / supersedingKeysOf", () => {
  it("keysSupersededBy(month_plus) → [month]; season is never a value in SUPERSEDED_BY", () => {
    expect(SubscriptionService.keysSupersededBy("month_plus")).toEqual(["month"]);
    expect(SubscriptionService.keysSupersededBy("season")).toEqual([]);
  });

  it("supersedingKeysOf(month) → [month_plus]; season has no superseding key", () => {
    expect(SubscriptionService.supersedingKeysOf("month")).toEqual(["month_plus"]);
    expect(SubscriptionService.supersedingKeysOf("season")).toEqual([]);
  });
});
