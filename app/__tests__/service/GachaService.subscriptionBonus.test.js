// GachaService.getActiveGachaSubscriptions / sumGachaTimesBonus — the single shared
// implementation now used by both GachaService.getRemainingDailyQuota and
// controller/princess/gacha.js#detectCanDaily (see file for the merge rationale).
// Covers: plain accumulation, Plus overriding month (paused → excluded), season stacking.

jest.mock("../../src/model/application/SubscribeUser", () => ({
  all: jest.fn(),
  table: "subscribe_user",
  getColumnName: jest.fn(col => `subscribe_user.${col}`),
}));
jest.mock("../../src/model/application/SubscribeCard", () => ({
  table: "subscribe_card",
  getColumnName: jest.fn(col => `subscribe_card.${col}`),
  SUPERSEDED_BY: { month: ["month_plus"] },
}));

const SubscribeUser = require("../../src/model/application/SubscribeUser");
const GachaService = require("../../src/service/GachaService");

describe("GachaService.getActiveGachaSubscriptions + sumGachaTimesBonus", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const day = 86400000;
  const row = (key, effects, startOffset = -day, endOffset = day) => ({
    subscribe_card_key: key,
    effects,
    start_at: new Date(+now + startOffset),
    end_at: new Date(+now + endOffset),
  });

  function mockJoinResult(rows) {
    const joinChain = { join: jest.fn().mockResolvedValue(rows) };
    SubscribeUser.all.mockReturnValue(joinChain);
    return joinChain;
  }

  beforeEach(() => jest.clearAllMocks());

  it("sums gacha_times across multiple active, non-overridden subscriptions (month + season stack)", async () => {
    mockJoinResult([
      row("month", [{ type: "gacha_times", value: 1 }]),
      row("season", [{ type: "gacha_times", value: 2 }]),
    ]);

    const active = await GachaService.getActiveGachaSubscriptions("Uabc", now);
    expect(GachaService.sumGachaTimesBonus(active)).toBe(3);
  });

  it("excludes month's gacha_times when month_plus is concurrently active (override)", async () => {
    mockJoinResult([
      row("month", [{ type: "gacha_times", value: 1 }]),
      row("month_plus", [{ type: "gacha_times", value: 5 }]),
    ]);

    const active = await GachaService.getActiveGachaSubscriptions("Uabc", now);
    const month = active.find(s => s.subscribe_card_key === "month");
    expect(month.paused).toBe(true);
    // 只計 Plus 的 5，不計被覆蓋的 month 的 1。
    expect(GachaService.sumGachaTimesBonus(active)).toBe(5);
  });

  it("season keeps stacking with Plus (never superseded)", async () => {
    mockJoinResult([
      row("season", [{ type: "gacha_times", value: 2 }]),
      row("month_plus", [{ type: "gacha_times", value: 5 }]),
    ]);

    const active = await GachaService.getActiveGachaSubscriptions("Uabc", now);
    expect(GachaService.sumGachaTimesBonus(active)).toBe(7);
  });

  it("parses JSON-string effects the same as array effects", async () => {
    mockJoinResult([row("month", JSON.stringify([{ type: "gacha_times", value: 1 }]))]);

    const active = await GachaService.getActiveGachaSubscriptions("Uabc", now);
    expect(GachaService.sumGachaTimesBonus(active)).toBe(1);
  });

  it("returns 0 bonus when no subscription is active", async () => {
    mockJoinResult([]);

    const active = await GachaService.getActiveGachaSubscriptions("Uabc", now);
    expect(GachaService.sumGachaTimesBonus(active)).toBe(0);
  });
});
