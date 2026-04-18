// SubscriptionService.hasEffect — unit tests covering active/expired/no-sub/malformed cases.

jest.mock("../../src/model/application/SubscribeUser", () => ({
  all: jest.fn(),
}));
jest.mock("../../src/model/application/SubscribeCard", () => ({
  first: jest.fn(),
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
