jest.mock("../../../service/ChatWeatherService");
const WeatherService = require("../../../service/ChatWeatherService");
const Controller = require("../WeatherController");

function ctx(userId = "U1") {
  return { event: { source: { userId } }, replyText: jest.fn(), replyFlex: jest.fn() };
}

describe("WeatherController.showToday", () => {
  it("replies observation-paused text when weather is null", async () => {
    WeatherService.getTodayStatus.mockResolvedValue({
      date: "d",
      weather: null,
      protection: null,
      godStoneBalance: 0,
    });
    const c = ctx();
    await Controller.showToday(c);
    expect(c.replyText).toHaveBeenCalledWith("今日天氣觀測暫停");
    expect(c.replyFlex).not.toHaveBeenCalled();
  });

  it("replies a Flex bubble when weather is present", async () => {
    WeatherService.getTodayStatus.mockResolvedValue({
      date: "2026-07-10",
      weather: {
        weather_key: "silent_fog",
        category: "debuff",
        name: "沉默霧氣",
        flavor_text: "x",
        effects: { raw_xp_mult: 0.9 },
        protection_type: "defog",
        protection_name: "破霧鈴",
        protection_cost: 30,
      },
      protection: null,
      godStoneBalance: 100,
    });
    const c = ctx();
    await Controller.showToday(c);
    expect(c.replyFlex).toHaveBeenCalledTimes(1);
    const [altText, bubble] = c.replyFlex.mock.calls[0];
    expect(altText).toBe("今日天氣");
    expect(bubble.type).toBe("bubble");
  });

  it("replies an identification-failure text when userId is missing", async () => {
    const c = ctx(null);
    await Controller.showToday(c);
    expect(c.replyText).toHaveBeenCalledWith("獲取失敗，無法辨識用戶");
    expect(c.replyFlex).not.toHaveBeenCalled();
  });
});
